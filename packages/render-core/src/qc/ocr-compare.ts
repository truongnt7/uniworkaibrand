import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodePng, type Raster } from './png.js';
import { otsuBinarize, runTesseract } from './ocr.js';
import { grayToRaster, type ProjectionGrid } from './rectify.js';
import { rectifiedFor } from './label-qc.js';
import type { Gray } from './ssim.js';

export interface OcrCompare {
  available: boolean;
  /** Chữ OCR được trên nhãn gốc đã che đúng vùng khuất/nghiêng của khung này. */
  expected: string;
  recognized: string;
}

async function ocrGray(g: Gray, lang: string): Promise<{ available: boolean; text: string }> {
  const dir = mkdtempSync(join(tmpdir(), 'aps-ocr-'));
  try {
    const path = join(dir, 'img.png');
    writeFileSync(path, encodePng(grayToRaster(otsuBinarize(g))));
    const r = await runTesseract(path, { lang, psm: 11 });
    return { available: r.available, text: r.text };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * OCR công bằng cho nhãn cong: chạy OCR trên khung đã nắn phẳng VÀ trên nhãn gốc bị che cùng vùng khuất, rồi so hai kết quả.
 * Nhờ vậy chữ bị cắt bởi độ cong/góc nhìn không bị tính là lỗi dựng.
 */
export async function ocrCompareForFrame(input: { frame: Raster; label: Raster; grid: ProjectionGrid }, lang = 'eng', width = 640): Promise<OcrCompare> {
  const { ref, got } = rectifiedFor(input, width);
  const refMasked: Gray = { ...ref, mask: got.mask, data: ref.data.map((v, i) => (got.mask[i] ? v : 255)) };
  const gotMasked: Gray = { ...got, data: got.data.map((v, i) => (got.mask[i] ? v : 255)) };
  const [e, r] = await Promise.all([ocrGray(refMasked, lang), ocrGray(gotMasked, lang)]);
  return { available: e.available && r.available, expected: e.text, recognized: r.text };
}
