import { spawn } from 'node:child_process';

export interface OcrResult {
  available: boolean;
  text: string;
  error?: string;
}

/** Chạy tesseract CLI (nếu có). Không có binary → available=false, không ném lỗi: QC rơi về SSIM-only và ghi rõ điều này. */
export function runTesseract(imagePath: string, opts: { lang?: string; psm?: number; bin?: string; timeoutMs?: number } = {}): Promise<OcrResult> {
  const bin = opts.bin ?? 'tesseract';
  return new Promise((resolve) => {
    const child = spawn(bin, [imagePath, 'stdout', '-l', opts.lang ?? 'eng', '--psm', String(opts.psm ?? 6)], { stdio: ['ignore', 'pipe', 'pipe'] });
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

/** Tỉ lệ token (≥3 ký tự, bỏ dấu, không phân biệt hoa/thường) trong văn bản kỳ vọng xuất hiện ở kết quả OCR (cho phép sai 1 ký tự). */
export function ocrMatchRatio(expected: string, recognized: string): number {
  const want = [...new Set(tokens(expected))];
  if (!want.length) return 1;
  const got = tokens(recognized);
  let hit = 0;
  for (const w of want) if (got.some((g) => editDistanceAtMost1(w, g))) hit++;
  return hit / want.length;
}
