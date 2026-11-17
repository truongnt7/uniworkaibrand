import { rename, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, SlideshowJob, isSlideshowRequest, type JobRecord } from '@aps/shared';
import { renderSlideshow } from '@aps/render-core';
import { assertLgplFfmpeg } from './ffmpeg.js';
import type { JobRunner, RunControl } from './queue.js';

export interface SlideshowRunnerOptions {
  jobsDir: string;
  /** Phông tiếng Việt đi kèm app. Luôn lấy lúc chạy (không dùng đường dẫn đã lưu trong job) để app dời chỗ/cập nhật vẫn chạy được. */
  fontPath: string;
  getFfmpegPath: () => Promise<string>;
  /** Chỉ test: bỏ kiểm LGPL. Không có đường cấu hình nào bật cờ này trong app. */
  enforceLgpl?: boolean;
}

/** Pipeline "ảnh sang video": một lần ffmpeg LGPL, không Blender. Thử lại = chạy lại từ đầu (vài giây). */
export class SlideshowRunner implements JobRunner {
  constructor(private readonly opts: SlideshowRunnerOptions) {}

  async run(job: JobRecord, ctl: RunControl): Promise<{ outputPath: string }> {
    const { request } = job;
    if (!isSlideshowRequest(request)) throw new AppError('INVALID_JOB', 'job không phải slideshow');
    if (job.target !== 'local') throw new AppError('TARGET_UNSUPPORTED', 'only local target is runnable');

    const workDir = join(this.opts.jobsDir, job.id);
    await mkdir(workDir, { recursive: true });
    ctl.setWorkDir(workDir);

    const ffmpegPath = await this.opts.getFfmpegPath();
    const { encoder } = this.opts.enforceLgpl === false ? { encoder: 'libopenh264' as const } : await assertLgplFfmpeg(ffmpegPath);
    const slide = SlideshowJob.parse({ ...request.job, fontPath: this.opts.fontPath });

    ctl.enter('encoding');
    const out = join(workDir, 'output.mp4');
    const part = join(workDir, 'output.part.mp4');
    const textDir = join(workDir, 'text');
    await rm(part, { force: true });
    try {
      await renderSlideshow(slide, {
        ffmpegPath,
        outputPath: part,
        workDir: textDir,
        videoCodec: encoder,
        signal: ctl.signal,
        onProgress: (frame) => ctl.frameProgress(frame),
      });
      await rename(part, out);
    } catch (err) {
      await rm(part, { force: true });
      throw err;
    } finally {
      await rm(textDir, { recursive: true, force: true });
    }
    return { outputPath: out };
  }

  async cleanup(job: JobRecord): Promise<void> {
    await rm(join(this.opts.jobsDir, job.id), { recursive: true, force: true });
  }
}

/** Chọn runner theo `job.pipeline` (Blender cho 3D, ffmpeg cho ảnh sang video). */
export class PipelineRunner implements JobRunner {
  constructor(
    private readonly blender: JobRunner,
    private readonly slideshow: JobRunner,
  ) {}

  private pick(job: JobRecord): JobRunner {
    return job.pipeline === 'slideshow' ? this.slideshow : this.blender;
  }

  run(job: JobRecord, ctl: RunControl) {
    return this.pick(job).run(job, ctl);
  }

  cleanup(job: JobRecord) {
    return this.pick(job).cleanup?.(job);
  }

  reclaim(job: JobRecord) {
    return this.pick(job).reclaim?.(job);
  }
}
