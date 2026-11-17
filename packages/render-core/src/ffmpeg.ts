import type { LogoOverlay, OutputSpec } from '@aps/shared';
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
  /** Logo theo timeline (job v2): mỗi logo hiện trong [t, tEnd] với hiệu ứng riêng. Có `logos` thì `logoPath` bị bỏ qua. */
  logos?: readonly LogoOverlay[] | undefined;
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
  if (o.logos?.length) {
    const { filter } = buildLogoFilter(o.logos, o);
    for (const l of o.logos) args.push('-loop', '1', '-framerate', String(o.fps), '-i', l.imagePath);
    args.push('-filter_complex', filter, '-map', '[v]');
  } else if (o.logoPath) {
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

const LOGO_FADE_IN_S = 0.5;
const LOGO_FADE_OUT_S = 0.3;

const num = (n: number) => String(Math.round(n * 1000) / 1000);

/**
 * Chuỗi filter overlay nhiều logo theo thời gian. Logo là ảnh gốc của người dùng, ghép ngoài shading 3D nên không méo.
 * Dấu phẩy trong biểu thức luôn nằm trong cặp nháy đơn để filtergraph không tách nhầm.
 */
export function buildLogoFilter(
  logos: readonly LogoOverlay[],
  o: Pick<FfmpegArgsOptions, 'width' | 'height'>,
): { inputs: number; filter: string } {
  const logoHeight = Math.round(o.height * 0.14);
  const mx = Math.round(o.width * 0.04);
  const my = Math.round(o.height * 0.06);
  const offset = Math.round(o.height * 0.05);
  const parts: string[] = [];
  let prev = '0:v';
  logos.forEach((l, i) => {
    const label = `lg${i}`;
    const chain = [`scale=-2:${logoHeight}`, 'format=rgba'];
    if (l.anim !== 'none') {
      chain.push(`fade=t=in:st=${num(l.t)}:d=${LOGO_FADE_IN_S}:alpha=1`);
      const outStart = Math.max(l.t + LOGO_FADE_IN_S, l.tEnd - LOGO_FADE_OUT_S);
      chain.push(`fade=t=out:st=${num(outStart)}:d=${LOGO_FADE_OUT_S}:alpha=1`);
    }
    parts.push(`[${i + 1}:v]${chain.join(',')}[${label}]`);

    const x = {
      center: '(W-w)/2',
      bottom_center: '(W-w)/2',
      bottom_right: `W-w-${mx}`,
      bottom_left: `${mx}`,
      top_right: `W-w-${mx}`,
      top_left: `${mx}`,
    }[l.position];
    const y = {
      center: '(H-h)/2',
      bottom_center: `H-h-${my}`,
      bottom_right: `H-h-${my}`,
      bottom_left: `H-h-${my}`,
      top_right: `${my}`,
      top_left: `${my}`,
    }[l.position];
    const yExpr = l.anim === 'slide_up' ? `${y}+(1-min(1,max(0,(t-${num(l.t)})/${LOGO_FADE_IN_S})))*${offset}` : y;
    const out = i === logos.length - 1 ? 'vcat' : `ov${i}`;
    parts.push(`[${prev}][${label}]overlay=x='${x}':y='${yExpr}':enable='between(t,${num(l.t)},${num(l.tEnd)})':shortest=1[${out}]`);
    prev = out;
  });
  parts.push(`[${prev}]format=yuv420p[v]`);
  return { inputs: logos.length, filter: parts.join(';') };
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
