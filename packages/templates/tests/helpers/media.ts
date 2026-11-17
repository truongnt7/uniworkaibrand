import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');

// ffmpeg LGPL ghim: APS_TEST_FFMPEG_LGPL, hoặc thư mục .cache/ffmpeg/<bản>/bin sau `node tools/ffmpeg/fetch-lgpl.mjs`. Không có thì test render bị bỏ qua.
export function findLgplFfmpeg(): string {
  const env = process.env.APS_TEST_FFMPEG_LGPL;
  if (env && existsSync(env)) return env;
  const cache = join(repoRoot, '.cache', 'ffmpeg');
  if (existsSync(cache)) {
    for (const d of readdirSync(cache)) {
      const p = join(cache, d, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if (existsSync(p)) return p;
    }
  }
  return '';
}

/** Font có tiếng Việt cho test (APS_TEST_FONT hoặc DejaVu/Noto/Arial thường có sẵn). */
export function findVietnameseFont(): string {
  const candidates = [
    process.env.APS_TEST_FONT ?? '',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/TTF/DejaVuSans.ttf',
    '/Library/Fonts/Arial Unicode.ttf',
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    'C:\\Windows\\Fonts\\arial.ttf',
  ];
  return candidates.find((p) => p && existsSync(p)) ?? '';
}

export function run(bin: string, args: string[]): { status: number | null; stdout: Buffer; stderr: string } {
  const r = spawnSync(bin, args, { maxBuffer: 256 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr?.toString() ?? '' };
}

/** Sinh ảnh thử bằng chính ffmpeg (nguồn lavfi), không cần tệp nhị phân trong repo. */
export function makeImage(ffmpeg: string, out: string, source: string): void {
  const r = run(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', source, '-frames:v', '1', out]);
  if (r.status !== 0) throw new Error(`không tạo được ảnh thử: ${r.stderr}`);
}

export function probe(ffmpeg: string, file: string): { codec: string; pixFmt: string; width: number; height: number; frames: number; durationS: number; audio: boolean } {
  const ffprobe = join(dirname(ffmpeg), process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
  const bin = existsSync(ffprobe) ? ffprobe : 'ffprobe';
  const r = run(bin, ['-v', 'error', '-count_frames', '-show_entries', 'stream=codec_type,codec_name,pix_fmt,width,height,nb_read_frames:format=duration', '-of', 'json', file]);
  const j = JSON.parse(r.stdout.toString()) as { streams: { codec_type: string; codec_name: string; pix_fmt?: string; width?: number; height?: number; nb_read_frames?: string }[]; format: { duration: string } };
  const v = j.streams.find((s) => s.codec_type === 'video')!;
  return { codec: v.codec_name, pixFmt: v.pix_fmt ?? '', width: v.width ?? 0, height: v.height ?? 0, frames: Number(v.nb_read_frames), durationS: Number(j.format.duration), audio: j.streams.some((s) => s.codec_type === 'audio') };
}

/** Lấy một khung ở giây `t` dạng RGB thô để kiểm điểm ảnh. */
export function frameAt(ffmpeg: string, file: string, t: number, w: number, h: number): Buffer {
  const r = run(ffmpeg, ['-v', 'error', '-ss', String(t), '-i', file, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${h}`, '-']);
  if (r.status !== 0 || r.stdout.length !== w * h * 3) throw new Error(`không đọc được khung @${t}s: ${r.stderr}`);
  return r.stdout;
}

export function pixel(frame: Buffer, w: number, x: number, y: number): [number, number, number] {
  const i = (y * w + x) * 3;
  return [frame[i]!, frame[i + 1]!, frame[i + 2]!];
}

export function meanAbsDiff(a: Buffer, b: Buffer): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / a.length;
}

export function writeFile(path: string, data: string | Uint8Array): void {
  writeFileSync(path, data);
}
