import { copyFile, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError, type JobRecord, type WorkerEvent } from '@aps/shared';
import {
  JsonLinesParser,
  blenderArgs,
  buildFfmpegArgs,
  compileWorkerJob,
  parseFfmpegProgress,
} from '@aps/render-core';
import type { JobRunner, RunControl } from './queue.js';
import { runProcess } from './process.js';

export interface BlenderRunnerOptions {
  jobsDir: string;
  /** Đường dẫn tuyệt đối tới blender-worker/worker.py (nằm trong bundle, người dùng không chọn được). */
  workerScript: string;
  getBlenderBinary: () => Promise<string>;
  ffmpegPath: string;
  onLog?: (jobId: string, line: string) => void;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export class BlenderRunner implements JobRunner {
  constructor(private readonly opts: BlenderRunnerOptions) {}

  async run(job: JobRecord, ctl: RunControl): Promise<{ outputPath: string }> {
    const { request } = job;
    if (job.target !== 'local') throw new AppError('TARGET_UNSUPPORTED', 'only local target is runnable');

    const blender = await this.opts.getBlenderBinary();
    const workDir = join(this.opts.jobsDir, job.id);
    const framesDir = join(workDir, 'frames');
    await mkdir(framesDir, { recursive: true });
    ctl.setWorkDir(workDir);

    // Khung dở dang (.part) do lần chạy trước bị ngắt không bao giờ được coi là khung hợp lệ.
    for (const f of await readdir(framesDir)) if (f.endsWith('.part')) await rm(join(framesDir, f), { force: true });

    for (const [label, p, code] of [
      ['glb', request.product.glbPath, 'GLB_NOT_FOUND'],
      ['label', request.product.label?.imagePath, 'LABEL_NOT_FOUND'],
    ] as const) {
      if (p && !(await exists(p))) throw new AppError(code, `${label} not found: ${p}`);
    }

    const workerJob = compileWorkerJob(request, { jobId: job.id, framesDir });
    const jobJson = join(workDir, 'job.json');
    await writeFile(jobJson, JSON.stringify(workerJob, null, 2));

    ctl.enter('rendering');
    await this.runBlender(blender, jobJson, workDir, job, ctl);

    if (request.output.kind === 'image') {
      const out = join(workDir, 'output.png');
      await copyFile(join(framesDir, 'frame_000001.png'), out);
      return { outputPath: out };
    }

    ctl.enter('encoding');
    const out = join(workDir, 'output.mp4');
    await this.encode(job, framesDir, out, ctl);
    return { outputPath: out };
  }

  async cleanup(job: JobRecord): Promise<void> {
    await rm(join(this.opts.jobsDir, job.id), { recursive: true, force: true });
  }

  private async runBlender(blender: string, jobJson: string, workDir: string, job: JobRecord, ctl: RunControl): Promise<void> {
    const parser = new JsonLinesParser();
    let lastError: Extract<WorkerEvent, { type: 'error' }> | null = null;
    let finished = false;

    const handle = (line: ReturnType<JsonLinesParser['push']>[number]) => {
      if (line.kind === 'raw') {
        this.opts.onLog?.(job.id, line.text);
        return;
      }
      const ev = line.event;
      switch (ev.type) {
        case 'frame_done':
          ctl.progress({ frame: ev.frame, skipped: ev.skipped });
          break;
        case 'device':
          ctl.setDevice(`${ev.engine}: ${ev.device}${ev.fallbackToCpu ? ' (CPU)' : ''}`);
          break;
        case 'error':
          lastError = ev;
          break;
        case 'done':
          finished = true;
          break;
        case 'log':
        case 'warning':
          this.opts.onLog?.(job.id, `${ev.type}: ${'message' in ev ? ev.message : ''}`);
          break;
        default:
          break;
      }
    };

    const result = await runProcess(blender, blenderArgs(this.opts.workerScript, jobJson), {
      cwd: workDir,
      signal: ctl.signal,
      onStdoutChunk: (c) => parser.push(c).forEach(handle),
    }).catch((err: NodeJS.ErrnoException) => {
      throw new AppError('RUNTIME_MISSING', `không chạy được Blender: ${err.message}`);
    });
    parser.flush().forEach(handle);

    if (result.aborted) throw new AppError('CANCELED', 'canceled');
    const err = lastError as Extract<WorkerEvent, { type: 'error' }> | null;
    if (err) throw new AppError(err.code, err.message, { detail: err.detail });
    if (result.code !== 0 || !finished) {
      throw new AppError('WORKER_EXIT', `Blender thoát với mã ${result.code ?? result.signal}`, { stderr: result.stderrTail });
    }
  }

  private async encode(job: JobRecord, framesDir: string, outPath: string, ctl: RunControl): Promise<void> {
    const { output } = job.request;
    const part = `${outPath}.part.mp4`;
    await rm(part, { force: true });
    const args = buildFfmpegArgs({
      framesDir,
      outputPath: part,
      fps: output.fps,
      width: output.width,
      height: output.height,
      durationS: job.totalFrames / output.fps,
      logoPath: output.logoPath,
    });
    let buf = '';
    const result = await runProcess(this.opts.ffmpegPath, args, {
      signal: ctl.signal,
      onStdoutChunk: (c) => {
        buf += c.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const l of lines) {
          const n = parseFfmpegProgress(l);
          if (n !== null) ctl.encodeProgress(n);
        }
      },
    }).catch((err: NodeJS.ErrnoException) => {
      throw new AppError(err.code === 'ENOENT' ? 'FFMPEG_MISSING' : 'FFMPEG_FAILED', `ffmpeg: ${err.message}`);
    });
    if (result.aborted) throw new AppError('CANCELED', 'canceled');
    if (result.code !== 0) throw new AppError('FFMPEG_FAILED', `ffmpeg thoát với mã ${result.code}`, { stderr: result.stderrTail });
    await rename(part, outPath);
  }
}
