import type { OutputSpec } from '@aps/shared';
import { FRAME_PATTERN } from './compile.js';

export interface FfmpegArgsOptions {
  framesDir: string;
  outputPath: string;
  fps: number;
  width: number;
  height: number;
  durationS: number;
  logoPath?: string | undefined;
  /** Mặc định libx264; có thể đổi sang encoder LGPL/phần cứng khi chốt giấy phép (P0-12). */
  videoCodec?: string;
}

export function sep(dir: string): string {
  return dir.includes('\\') && !dir.includes('/') ? '\\' : '/';
}

/**
 * Ghép chuỗi PNG thành H.264 yuv420p + faststart (chuẩn đăng FB/IG/TikTok).
 * Logo (PNG) được overlay ở ~1,2 giây cuối với hiệu ứng fade-in, ngoài shading 3D nên không méo.
 */
export function buildFfmpegArgs(o: FfmpegArgsOptions): string[] {
  const input = `${o.framesDir}${sep(o.framesDir)}${FRAME_PATTERN}`;
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats', '-framerate', String(o.fps), '-i', input];
  const codec = o.videoCodec ?? 'libx264';
  if (o.logoPath) {
    const logoStart = Math.max(0, o.durationS - 1.2);
    const logoHeight = Math.round(o.height * 0.14);
    args.push('-loop', '1', '-framerate', String(o.fps), '-i', o.logoPath);
    args.push(
      '-filter_complex',
      `[1:v]scale=-2:${logoHeight},format=rgba,fade=t=in:st=${logoStart.toFixed(3)}:d=0.6:alpha=1[logo];` +
        `[0:v][logo]overlay=x=(W-w)/2:y=H-h-${Math.round(o.height * 0.06)}:shortest=1,format=yuv420p[v]`,
      '-map',
      '[v]',
    );
  } else {
    args.push('-vf', 'format=yuv420p');
  }
  args.push(
    '-c:v',
    codec,
    ...(codec === 'libx264' ? ['-preset', 'medium', '-crf', '18'] : []),
    '-pix_fmt',
    'yuv420p',
    '-r',
    String(o.fps),
    '-movflags',
    '+faststart',
    o.outputPath,
  );
  return args;
}

/** Ffmpeg `-progress pipe:1` in các dòng key=value; lấy số khung đã ghép. */
export function parseFfmpegProgress(line: string): number | null {
  const m = /^frame=(\d+)/.exec(line.trim());
  return m ? Number(m[1]) : null;
}

export function outputExtension(kind: OutputSpec['kind']): string {
  return kind === 'video' ? 'mp4' : 'png';
}
