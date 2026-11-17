import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AppError,
  SlideshowJob,
  slideshowDurationS,
  type CardScene,
  type CollageScene,
  type PhotoScene,
  type SlideText,
  type SlideshowJobInput,
} from '@aps/shared';
import { encoderArgs, parseFfmpegProgress } from './ffmpeg.js';
import { isAllowedEncoder } from './ffmpeg-policy.js';

/**
 * Ảnh sang video bằng ffmpeg (LGPL): Ken Burns, ghép ảnh, chữ, logo, nhạc tuỳ chọn.
 * Hàm `planSlideshow` thuần (không chạy tiến trình) để test được; `renderSlideshow` mới spawn ffmpeg.
 *
 * An toàn: văn bản người dùng nhập chỉ đi vào tệp văn bản (`drawtext=textfile=`, `expansion=none`), không bao giờ nằm trong filtergraph;
 * đường dẫn tệp vào `-i file:<path>` (tắt giao thức lạ như `concat:`/`http:`); chỉ đường dẫn font/textfile nằm trong filtergraph và được escape.
 */

/** Hệ số bề rộng trung bình của một ký tự so với cỡ chữ (font sans có dấu tiếng Việt, ước lượng thận trọng). */
const CHAR_WIDTH_EM = 0.58;
const TEXT_MAX_LINES = 4;
const TEXT_WIDTH_FRACTION = 0.84;
const STYLE_FACTOR = { title: 0.08, body: 0.052, small: 0.04 } as const;
const MAX_COMMAND_LENGTH = 28_000;

export interface PlannedFile {
  path: string;
  content: string;
}

export interface SlideshowPlan {
  args: string[];
  /** Tệp văn bản phải được ghi trước khi chạy ffmpeg. */
  files: PlannedFile[];
  durationS: number;
  totalFrames: number;
  bitrate: number;
}

export interface PlanOptions {
  outputPath: string;
  /** Thư mục chứa tệp văn bản tạm. */
  workDir: string;
  videoCodec?: string;
}

/** Bỏ ký tự điều khiển (giữ xuống dòng nếu `keepNewline`). */
function stripControl(s: string, keepNewline = false): string {
  return [...s].filter((ch) => {
    const c = ch.codePointAt(0)!;
    return !(c < 32 || c === 127) || (keepNewline && c === 10);
  }).join('');
}

/** Xuống dòng theo từ; giữ nguyên xuống dòng do người dùng nhập. */
export function wrapText(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/[ \t]+/).filter(Boolean)) {
      if (!line) line = word;
      else if ([...line].length + 1 + [...word].length <= maxChars) line += ` ${word}`;
      else {
        out.push(line);
        line = word;
      }
    }
    out.push(line);
  }
  return out;
}

export interface FittedText {
  lines: string[];
  fontSize: number;
}

/** Chọn cỡ chữ và xuống dòng sao cho vừa khung; quá dài thì co tới 60% rồi cắt bằng "…". */
export function fitText(text: string, style: SlideText['style'], width: number, height: number): FittedText {
  const base = Math.min(width, height) * STYLE_FACTOR[style];
  const clean = stripControl(text.normalize('NFC'), true).trim();
  for (let scale = 1; scale >= 0.6; scale -= 0.08) {
    const size = Math.round(base * scale);
    const maxChars = Math.max(4, Math.floor((width * TEXT_WIDTH_FRACTION) / (CHAR_WIDTH_EM * size)));
    const lines = wrapText(clean, maxChars);
    if (lines.length <= TEXT_MAX_LINES && lines.every((l) => [...l].length <= maxChars + 2)) return { lines, fontSize: size };
  }
  const size = Math.round(base * 0.6);
  const maxChars = Math.max(4, Math.floor((width * TEXT_WIDTH_FRACTION) / (CHAR_WIDTH_EM * size)));
  const lines = wrapText(clean, maxChars).slice(0, TEXT_MAX_LINES);
  const last = [...(lines[TEXT_MAX_LINES - 1] ?? '')];
  if (wrapText(clean, maxChars).length > TEXT_MAX_LINES) lines[TEXT_MAX_LINES - 1] = `${last.slice(0, Math.max(1, maxChars - 1)).join('')}…`;
  return { lines, fontSize: size };
}

/** Escape đường dẫn dùng làm giá trị tuỳ chọn của filter (bọc nháy đơn; `\` -> `/`, `:` -> `\:`). */
export function escapeFilterPath(path: string): string {
  if (path.includes("'") || stripControl(path) !== path) {
    throw new AppError('SLIDESHOW_BAD_PATH', 'Đường dẫn tệp có ký tự không hợp lệ (nháy đơn hoặc ký tự điều khiển). Hãy đổi tên tệp hoặc thư mục.', { path });
  }
  return `'${path.replace(/\\/g, '/').replace(/:/g, '\\:')}'`;
}

/** Ảnh JPEG là dải đầy đủ (yuvj420p, ma trận 601): ép về dải TV + BT.709 để mp4 hiển thị đúng màu và giữ pix_fmt yuv420p. */
const TV = 'out_range=tv:out_color_matrix=bt709';
const num = (n: number) => String(Math.round(n * 1000) / 1000);
const hexColor = (c: string) => `0x${c.slice(1).toLowerCase()}`;

function safeZone(width: number, height: number): { top: number; bottom: number } {
  const ratio = height / width;
  if (ratio > 1.5) return { top: 0.12, bottom: 0.8 };
  if (ratio > 1.1) return { top: 0.06, bottom: 0.9 };
  return { top: 0.07, bottom: 0.92 };
}

function yExpression(position: SlideText['position'], width: number, height: number): string {
  const z = safeZone(width, height);
  switch (position) {
    case 'top':
      return `h*${z.top}`;
    case 'center':
      return '(h-text_h)/2';
    case 'lower_third':
      return `h*${num(z.bottom - 0.16)}-text_h`;
    case 'bottom':
      return `h*${z.bottom}-text_h`;
  }
}

export function sceneFrames(durationS: number, fps: number): number {
  return Math.max(1, Math.round(durationS * fps));
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bố cục ô ghép ở độ phân giải gấp đôi khung (portrait: xếp dọc, ngang/vuông: xếp ngang cho 2 ảnh). */
export function collageLayout(n: number, w: number, h: number): { cells: Rect[]; lines: Rect[] } {
  const T = 6;
  const portrait = h > w;
  if (n === 2) {
    return portrait
      ? { cells: [{ x: 0, y: 0, w, h: h / 2 }, { x: 0, y: h / 2, w, h: h / 2 }], lines: [{ x: 0, y: h / 2 - T / 2, w, h: T }] }
      : { cells: [{ x: 0, y: 0, w: w / 2, h }, { x: w / 2, y: 0, w: w / 2, h }], lines: [{ x: w / 2 - T / 2, y: 0, w: T, h }] };
  }
  if (n === 3) {
    return portrait
      ? {
          cells: [{ x: 0, y: 0, w, h: h / 2 }, { x: 0, y: h / 2, w: w / 2, h: h / 2 }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2 }],
          lines: [{ x: 0, y: h / 2 - T / 2, w, h: T }, { x: w / 2 - T / 2, y: h / 2, w: T, h: h / 2 }],
        }
      : {
          cells: [{ x: 0, y: 0, w: w / 2, h }, { x: w / 2, y: 0, w: w / 2, h: h / 2 }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2 }],
          lines: [{ x: w / 2 - T / 2, y: 0, w: T, h }, { x: w / 2, y: h / 2 - T / 2, w: w / 2, h: T }],
        };
  }
  return {
    cells: [{ x: 0, y: 0, w: w / 2, h: h / 2 }, { x: w / 2, y: 0, w: w / 2, h: h / 2 }, { x: 0, y: h / 2, w: w / 2, h: h / 2 }, { x: w / 2, y: h / 2, w: w / 2, h: h / 2 }],
    lines: [{ x: w / 2 - T / 2, y: 0, w: T, h }, { x: 0, y: h / 2 - T / 2, w, h: T }],
  };
}

function motionExpr(motion: PhotoScene['motion'], zoom: number, frames: number): { z: string; x: string; y: string } {
  const f = Math.max(1, frames - 1);
  const cx = 'iw/2-(iw/zoom/2)';
  const cy = 'ih/2-(ih/zoom/2)';
  switch (motion) {
    case 'zoom_in':
      return { z: `1+${num(zoom)}*on/${f}`, x: cx, y: cy };
    case 'zoom_out':
      return { z: `1+${num(zoom)}*(1-on/${f})`, x: cx, y: cy };
    case 'pan_left':
      return { z: `${1 + zoom}`, x: `(iw-iw/zoom)*(1-on/${f})`, y: cy };
    case 'pan_right':
      return { z: `${1 + zoom}`, x: `(iw-iw/zoom)*(on/${f})`, y: cy };
    case 'none':
      return { z: '1', x: cx, y: cy };
  }
}

interface TextPlan {
  filters: string[];
  files: PlannedFile[];
}

function textFilters(texts: readonly SlideText[], sceneIdx: number, sceneDur: number, o: { width: number; height: number; fontPath: string; workDir: string }): TextPlan {
  const filters: string[] = [];
  const files: PlannedFile[] = [];
  texts.forEach((t, k) => {
    const fitted = fitText(t.text, t.style, o.width, o.height);
    const path = join(o.workDir, `text_${sceneIdx}_${k}.txt`);
    files.push({ path, content: fitted.lines.join('\n') });
    const start = t.t;
    const end = Math.min(t.tEnd ?? sceneDur, sceneDur);
    const opts = [
      `fontfile=${escapeFilterPath(o.fontPath)}`,
      `textfile=${escapeFilterPath(path)}`,
      'expansion=none',
      'text_align=center',
      `fontsize=${fitted.fontSize}`,
      `fontcolor=${hexColor(t.color)}`,
      `x='(w-text_w)/2'`,
      `y='${yExpression(t.position, o.width, o.height)}'`,
      `line_spacing=${Math.round(fitted.fontSize * 0.18)}`,
      `enable='between(t,${num(start)},${num(end)})'`,
    ];
    if (t.box) opts.push('box=1', `boxcolor=${hexColor(t.boxColor)}@${num(t.boxOpacity)}`, `boxborderw=${Math.round(fitted.fontSize * 0.35)}`);
    if (t.anim === 'fade') {
      opts.push(`alpha='min(1,max(0,(t-${num(start)})/0.35))*min(1,max(0,(${num(end)}-t)/0.3))'`);
    }
    filters.push(`drawtext=${opts.join(':')}`);
  });
  return { filters, files };
}

function bitrateFor(width: number, height: number, fps: number, durationS: number, maxBytes: number, hasAudio: boolean): number {
  const visual = width * height * fps * 0.06;
  const cap = (maxBytes * 8) / Math.max(1, durationS) - (hasAudio ? 160_000 : 0);
  return Math.round(Math.max(600_000, Math.min(visual, cap, 12_000_000)));
}

/** Biên dịch job slideshow thành dòng lệnh ffmpeg (một filtergraph, một lần mã hoá, không tệp trung gian ngoài tệp chữ). */
export function planSlideshow(jobInput: SlideshowJobInput | SlideshowJob, opts: PlanOptions): SlideshowPlan {
  const job = SlideshowJob.parse(jobInput);
  const codec = opts.videoCodec ?? 'libopenh264';
  if (!isAllowedEncoder(codec)) {
    throw new AppError('FFMPEG_NO_ALLOWED_ENCODER', `encoder không nằm trong danh sách cho phép (LGPL): ${codec}`);
  }
  const { width: W, height: H, fps } = job.output;
  const SW = W * 2;
  const SH = H * 2;
  const inputs: string[] = [];
  const parts: string[] = [];
  const files: PlannedFile[] = [];
  let nextInput = 0;
  const addImage = (path: string): number => {
    inputs.push('-i', `file:${path}`);
    return nextInput++;
  };
  const textOpts = { width: W, height: H, fontPath: job.fontPath, workDir: opts.workDir };

  job.scenes.forEach((scene, i) => {
    const frames = sceneFrames(scene.durationS, fps);
    const chain: string[] = [];
    if (scene.type === 'card') {
      parts.push(`color=c=${hexColor((scene as CardScene).backgroundColor)}:s=${W}x${H}:r=${fps}:d=${num(scene.durationS)},format=yuv420p,setsar=1,trim=end_frame=${frames}[v${i}a]`);
    } else {
      const { z, x, y } = motionExpr(scene.motion, scene.zoom, frames);
      if (scene.type === 'photo') {
        const k = addImage(scene.imagePath);
        if (scene.fit === 'cover') {
          parts.push(`[${k}:v]scale=${SW}:${SH}:force_original_aspect_ratio=increase:${TV},crop=${SW}:${SH},setsar=1,format=yuv420p[b${i}]`);
        } else {
          const sw = Math.max(2, Math.round(SW / 8));
          const sh = Math.max(2, Math.round(SH / 8));
          parts.push(
            `[${k}:v]scale=iw:ih:${TV},format=yuv420p,split[bga${i}][fga${i}];` +
              `[bga${i}]scale=${SW}:${SH}:force_original_aspect_ratio=increase,crop=${SW}:${SH},scale=${sw}:${sh},gblur=sigma=5,scale=${SW}:${SH}[bg${i}];` +
              `[fga${i}]scale=${SW}:${SH}:force_original_aspect_ratio=decrease[fg${i}];` +
              `[bg${i}][fg${i}]overlay=(W-w)/2:(H-h)/2,setsar=1[b${i}]`,
          );
        }
      } else {
        const col = scene as CollageScene;
        const layout = collageLayout(col.imagePaths.length, SW, SH);
        const labels = col.imagePaths.map((p, j) => {
          const k = addImage(p);
          const c = layout.cells[j]!;
          parts.push(`[${k}:v]scale=${c.w}:${c.h}:force_original_aspect_ratio=increase:${TV},crop=${c.w}:${c.h},setsar=1,format=yuv420p[c${i}_${j}]`);
          return `[c${i}_${j}]`;
        });
        const pos = layout.cells.map((c) => `${c.x}_${c.y}`).join('|');
        const lines = col.dividers ? layout.lines.map((l) => `,drawbox=x=${l.x}:y=${l.y}:w=${l.w}:h=${l.h}:color=white@0.95:t=fill`).join('') : '';
        parts.push(`${labels.join('')}xstack=inputs=${labels.length}:layout=${pos}:fill=black${lines}[b${i}]`);
      }
      chain.push(`zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${W}x${H}:fps=${fps}`);
      if (scene.shade > 0) chain.push(`drawbox=x=0:y=0:w=iw:h=ih:color=black@${num(scene.shade)}:t=fill`);
      parts.push(`[b${i}]${chain.join(',')}[v${i}a]`);
    }
    const tp = textFilters(scene.texts, i, scene.durationS, textOpts);
    files.push(...tp.files);
    parts.push(`[v${i}a]${[...tp.filters, `fps=${fps}`, 'setsar=1', 'format=yuv420p', 'setpts=PTS-STARTPTS'].join(',')}[s${i}]`);
  });

  let cur = 's0';
  let curT = job.scenes[0]!.durationS;
  for (let i = 1; i < job.scenes.length; i++) {
    const s = job.scenes[i]!;
    const out = `x${i}`;
    if (s.transition === 'none') {
      parts.push(`[${cur}][s${i}]concat=n=2:v=1:a=0[${out}]`);
      curT += s.durationS;
    } else {
      parts.push(`[${cur}][s${i}]xfade=transition=${s.transition}:duration=${num(s.transitionS)}:offset=${num(curT - s.transitionS)}[${out}]`);
      curT += s.durationS - s.transitionS;
    }
    cur = out;
  }

  const durationS = slideshowDurationS(job);
  const totalFrames = Math.round(durationS * fps);

  if (job.logo) {
    const k = nextInput++;
    inputs.push('-loop', '1', '-framerate', String(fps), '-i', `file:${job.logo.imagePath}`);
    const L = job.logo;
    const start = L.t;
    const end = Math.min(L.tEnd ?? durationS, durationS);
    const mx = Math.round(W * 0.04);
    const my = Math.round(H * 0.05);
    const lx = { center: '(W-w)/2', top_center: '(W-w)/2', bottom_center: '(W-w)/2', bottom_right: `W-w-${mx}`, top_right: `W-w-${mx}`, bottom_left: `${mx}`, top_left: `${mx}` }[L.position];
    const ly = { center: '(H-h)/2', top_center: `${my}`, bottom_center: `H-h-${my}`, bottom_right: `H-h-${my}`, bottom_left: `H-h-${my}`, top_right: `${my}`, top_left: `${my}` }[L.position];
    const lchain = [`scale=-2:${Math.round(H * L.heightPct)}`, 'format=rgba'];
    if (L.anim === 'fade_in') lchain.push(`fade=t=in:st=${num(start)}:d=0.5:alpha=1`);
    parts.push(`[${k}:v]${lchain.join(',')}[logo]`);
    parts.push(`[${cur}][logo]overlay=x='${lx}':y='${ly}':enable='between(t,${num(start)},${num(end)})':shortest=1[xlogo]`);
    cur = 'xlogo';
  }
  parts.push(`[${cur}]format=yuv420p[v]`);

  const hasAudio = job.audio !== undefined;
  if (job.audio) {
    const A = job.audio;
    const k = nextInput++;
    inputs.push('-stream_loop', '-1', '-i', `file:${A.path}`);
    const fadeOutStart = Math.max(0, durationS - A.fadeOutS);
    const chain = [`atrim=duration=${num(durationS)}`, 'asetpts=PTS-STARTPTS', `volume=${num(A.volume)}`];
    if (A.fadeInS > 0) chain.push(`afade=t=in:st=0:d=${num(A.fadeInS)}`);
    if (A.fadeOutS > 0) chain.push(`afade=t=out:st=${num(fadeOutStart)}:d=${num(A.fadeOutS)}`);
    chain.push('aformat=sample_rates=44100:channel_layouts=stereo');
    parts.push(`[${k}:a]${chain.join(',')}[a]`);
  }

  const bitrate = bitrateFor(W, H, fps, durationS, job.output.maxBytes, hasAudio);
  const args = [
    '-y', '-hide_banner', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats',
    ...inputs,
    '-filter_complex', parts.join(';'),
    '-map', '[v]',
    ...(hasAudio ? ['-map', '[a]'] : ['-an']),
    '-c:v', codec,
    ...encoderArgs(codec, { fps, width: W, height: H, bitrate }),
    '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
    '-r', String(fps),
    ...(hasAudio ? ['-c:a', 'aac', '-b:a', '128k'] : []),
    '-t', durationS.toFixed(3),
    '-movflags', '+faststart',
    opts.outputPath,
  ];
  if (args.join(' ').length > MAX_COMMAND_LENGTH) {
    throw new AppError('SLIDESHOW_TOO_COMPLEX', 'Video có quá nhiều cảnh/chữ để dựng một lần. Hãy bớt số cảnh hoặc rút gọn chữ.');
  }
  return { args, files, durationS, totalFrames, bitrate };
}

async function assertReadable(path: string, code: string, message: string): Promise<void> {
  try {
    await access(path);
  } catch {
    throw new AppError(code, message, { path });
  }
}

/** Kiểm tra mọi tệp đầu vào tồn tại, báo lỗi tiếng Việt kèm đường dẫn (UI dịch theo `code`). */
export async function preflightSlideshow(jobInput: SlideshowJobInput | SlideshowJob): Promise<void> {
  const job = SlideshowJob.parse(jobInput);
  await assertReadable(job.fontPath, 'SLIDESHOW_FONT_MISSING', 'Không tìm thấy phông chữ của ứng dụng. Hãy cài lại ứng dụng.');
  for (const [i, s] of job.scenes.entries()) {
    const paths = s.type === 'photo' ? [s.imagePath] : s.type === 'collage' ? s.imagePaths : [];
    for (const p of paths) await assertReadable(p, 'SLIDESHOW_PHOTO_MISSING', `Không tìm thấy ảnh ở cảnh ${i + 1}. Có thể ảnh đã bị xoá hoặc di chuyển, hãy chọn lại ảnh.`);
  }
  if (job.logo) await assertReadable(job.logo.imagePath, 'SLIDESHOW_LOGO_MISSING', 'Không tìm thấy tệp logo. Hãy chọn lại logo hoặc bỏ logo.');
  if (job.audio) await assertReadable(job.audio.path, 'SLIDESHOW_AUDIO_MISSING', 'Không tìm thấy tệp nhạc. Hãy chọn lại nhạc hoặc chọn "không nhạc".');
}

export interface RenderSlideshowOptions {
  ffmpegPath: string;
  outputPath: string;
  /** Thư mục tệp chữ tạm; mặc định tạo thư mục tạm và xoá sau khi xong. */
  workDir?: string;
  videoCodec?: string;
  signal?: AbortSignal;
  onProgress?: (frame: number, totalFrames: number) => void;
}

export interface RenderSlideshowResult {
  outputPath: string;
  durationS: number;
  totalFrames: number;
  bitrate: number;
}

export async function renderSlideshow(jobInput: SlideshowJobInput | SlideshowJob, o: RenderSlideshowOptions): Promise<RenderSlideshowResult> {
  await preflightSlideshow(jobInput);
  const ownWorkDir = o.workDir === undefined;
  const workDir = o.workDir ?? mkdtempSync(join(tmpdir(), 'aps-slideshow-'));
  try {
    mkdirSync(workDir, { recursive: true });
    const plan = planSlideshow(jobInput, { outputPath: o.outputPath, workDir, ...(o.videoCodec ? { videoCodec: o.videoCodec } : {}) });
    for (const f of plan.files) writeFileSync(f.path, f.content, 'utf8');
    await new Promise<void>((resolve, reject) => {
      const child = spawn(o.ffmpegPath, plan.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      let stderr = '';
      let buf = '';
      child.stderr.on('data', (c: Buffer) => (stderr = (stderr + c.toString('utf8')).slice(-4000)));
      child.stdout.on('data', (c: Buffer) => {
        buf += c.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const frame = parseFfmpegProgress(line);
          if (frame !== null) o.onProgress?.(frame, plan.totalFrames);
        }
      });
      const onAbort = () => child.kill('SIGKILL');
      o.signal?.addEventListener('abort', onAbort, { once: true });
      child.on('error', (e: NodeJS.ErrnoException) => {
        reject(
          e.code === 'ENOENT'
            ? new AppError('FFMPEG_MISSING', 'Không tìm thấy ffmpeg. Hãy mở mục Cài đặt để cài lại thành phần dựng video.')
            : new AppError('SLIDESHOW_FFMPEG_FAILED', `Không chạy được ffmpeg: ${e.message}`),
        );
      });
      child.on('close', (code) => {
        o.signal?.removeEventListener('abort', onAbort);
        if (o.signal?.aborted) reject(new AppError('SLIDESHOW_CANCELED', 'Đã huỷ dựng video.'));
        else if (code === 0) resolve();
        else reject(new AppError('SLIDESHOW_FFMPEG_FAILED', 'Dựng video không thành công. Hãy thử lại; nếu vẫn lỗi, hãy đổi ảnh khác (một số ảnh bị hỏng hoặc định dạng lạ).', { code, stderr: stderr.slice(-1500) }));
      });
    });
    return { outputPath: o.outputPath, durationS: plan.durationS, totalFrames: plan.totalFrames, bitrate: plan.bitrate };
  } finally {
    if (ownWorkDir) rmSync(workDir, { recursive: true, force: true });
  }
}
