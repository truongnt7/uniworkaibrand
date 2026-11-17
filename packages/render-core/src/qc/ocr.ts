import { spawn } from 'node:child_process';
import type { Gray } from './ssim.js';

export interface OcrResult {
  available: boolean;
  text: string;
  error?: string;
}

/** Chạy tesseract CLI (nếu có). Không có binary → available=false, không ném lỗi: QC rơi về SSIM-only và ghi rõ điều này. */
export function runTesseract(imagePath: string, opts: { lang?: string; psm?: number; bin?: string; timeoutMs?: number } = {}): Promise<OcrResult> {
  const bin = opts.bin ?? 'tesseract';
  return new Promise((resolve) => {
    const child = spawn(bin, [imagePath, 'stdout', '-l', opts.lang ?? 'eng', '--psm', String(opts.psm ?? 11)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs ?? 30_000);
    child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
    child.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      resolve({ available: e.code !== 'ENOENT', text: '', error: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 ? { available: true, text: out } : { available: true, text: '', error: err.trim().slice(0, 300) || `tesseract exit ${code}` });
    });
  });
}

function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

function tokens(s: string): string[] {
  return fold(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 3);
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : b.slice(i + 1) === a.slice(i);
}

/** Có ít nhất một từ (≥3 ký tự chữ/số) đọc được. */
export function hasReadableText(s: string): boolean {
  return tokens(s).length > 0;
}

/** Tỉ lệ token (≥3 ký tự, bỏ dấu, không phân biệt hoa/thường) trong văn bản kỳ vọng xuất hiện ở kết quả OCR (cho phép sai 1 ký tự). */
export function ocrMatchRatio(expected: string, recognized: string): number {
  const want = [...new Set(tokens(expected))];
  if (!want.length) return 1;
  const got = tokens(recognized);
  let hit = 0;
  for (const w of want) if (got.some((g) => editDistanceAtMost1(w, g))) hit++;
  return hit / want.length;
}

/** Nhị phân hóa Otsu (chữ đen trên nền sáng) trước khi OCR: ảnh nắn phẳng từ render thường mềm và tương phản thấp. */
export function otsuBinarize(g: Gray): Gray {
  const hist = new Array<number>(256).fill(0);
  let n = 0;
  for (let i = 0; i < g.data.length; i++) {
    if (!g.mask[i]) continue;
    hist[Math.min(255, Math.max(0, Math.round(g.data[i]!)))]!++;
    n++;
  }
  if (!n) return g;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t]!;
  let wB = 0, sumB = 0, best = 0, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = n - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const d = (sumB / wB - (sum - sumB) / wF) ** 2 * wB * wF;
    if (d > best) { best = d; thr = t; }
  }
  const data = new Float32Array(g.data.length);
  for (let i = 0; i < data.length; i++) data[i] = g.data[i]! > thr ? 255 : 0;
  return { ...g, data };
}
