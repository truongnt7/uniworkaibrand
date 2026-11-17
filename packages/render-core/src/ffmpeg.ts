import type { OutputSpec } from '@aps/shared';
import { AppError } from '@aps/shared';
import { FRAME_PATTERN } from './compile.js';
import { isAllowedEncoder } from './ffmpeg-policy.js';

export interface FfmpegArgsOptions {
  framesDir: string;
  outputPath: string;
  fps: number;
  width: number;
  height: number;
  durationS: number;
  logoPath?: string | undefined;
  /** Chỉ nhận encoder trong danh sách cho phép (LGPL-safe); mặc định libopenh264. libx264 (GPL) bị từ chối. */
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
  const codec = o.videoCodec ?? 'libopenh264';
  if (!isAllowedEncoder(codec)) {
    throw new AppError('FFMPEG_NO_ALLOWED_ENCODER', `encoder không nằm trong danh sách cho phép (LGPL): ${codec}`);
  }
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
    ...encoderArgs(codec, o),
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

/** ~0,15 bit/pixel/khung: 1080p30 ≈ 9 Mb/s, đủ sắc nét cho nhãn chữ nhỏ; encoder LGPL không có CRF nên dùng bitrate. */
export function targetBitrate(width: number, height: number, fps: number): number {
  return Math.round(Math.min(40_000_000, Math.max(1_000_000, width * height * fps * 0.15)));
}

function encoderArgs(codec: string, o: Pick<FfmpegArgsOptions, 'fps' | 'width' | 'height'>): string[] {
  const bitrate = String(targetBitrate(o.width, o.height, o.fps));
  const gop = String(Math.max(1, o.fps * 2));
  switch (codec) {
    case 'libopenh264':
      return ['-b:v', bitrate, '-g', gop, '-profile:v', 'high', '-allow_skip_frames', '0'];
    case 'h264_nvenc':
      return ['-b:v', bitrate, '-g', gop, '-preset', 'p5'];
    default:
      return ['-b:v', bitrate, '-g', gop];
  }
}

/** Ffmpeg `-progress pipe:1` in các dòng key=value; lấy số khung đã ghép. */
export function parseFfmpegProgress(line: string): number | null {
  const m = /^frame=(\d+)/.exec(line.trim());
  return m ? Number(m[1]) : null;
}

export function outputExtension(kind: OutputSpec['kind']): string {
  return kind === 'video' ? 'mp4' : 'png';
}
