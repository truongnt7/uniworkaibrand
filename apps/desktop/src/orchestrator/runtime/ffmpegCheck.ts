import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError } from '@aps/shared';
import { assertLgplFfmpeg, resetFfmpegInspectionCache } from '../ffmpeg.js';
import { runProcess } from '../process.js';

/**
 * Cổng kiểm tra khi cài FFmpeg: (1) chính sách LGPL (không --enable-gpl/--enable-nonfree/libx264...), (2) có encoder H.264 được
 * phép, (3) mã hóa thử 3 khung ra mp4. Lỗi bất kỳ -> không kích hoạt, giữ bản cũ.
 */
export async function checkFfmpegBinary(binary: string, signal?: AbortSignal): Promise<void> {
  resetFfmpegInspectionCache();
  const { encoder } = await assertLgplFfmpeg(binary);
  const dir = await mkdtemp(join(tmpdir(), 'aps-ffcheck-'));
  try {
    const out = join(dir, 'probe.mp4');
    const r = await runProcess(
      binary,
      ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=10:duration=0.3', '-c:v', encoder, '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', out],
      { signal },
    ).catch((e: NodeJS.ErrnoException) => {
      throw new AppError('SMOKE_TEST_FAILED', `không chạy được ffmpeg: ${e.message}`);
    });
    if (r.aborted) throw new AppError('CANCELED', 'canceled');
    const info = await stat(out).catch(() => null);
    if (r.code !== 0 || !info || info.size === 0) {
      throw new AppError('SMOKE_TEST_FAILED', `ffmpeg không mã hóa thử được bằng ${encoder}`, { stderr: r.stderrTail });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
