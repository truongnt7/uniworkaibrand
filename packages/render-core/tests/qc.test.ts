import { describe, expect, it } from 'vitest';
import {
  assessLabelFrame, decodePng, encodePng, normalizeGray, ocrMatchRatio, resizeGray, ssim, summarizeSweep, toGray,
  type ProjectionGrid, type Raster,
} from '../src/index.js';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

/** Nhãn tổng hợp: các khối chữ nhật ngẫu nhiên có cấu trúc (giống chữ/logo) trên nền sáng. */
function makeLabel(w = 240, h = 120, seed = 1): Raster {
  const r = rng(seed);
  const data = new Uint8Array(w * h * 4).fill(255);
  for (let k = 0; k < 40; k++) {
    const x0 = Math.floor(r() * w * 0.9), y0 = Math.floor(r() * h * 0.9);
    const bw = 4 + Math.floor(r() * 30), bh = 3 + Math.floor(r() * 10);
    const v = Math.floor(r() * 120);
    for (let y = y0; y < Math.min(h, y0 + bh); y++) for (let x = x0; x < Math.min(w, x0 + bw); x++) {
      const o = (y * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
    }
  }
  return { width: w, height: h, data };
}

function frameWith(label: Raster, opts: { x: number; y: number; scale: number; gain?: number; bias?: number; fw?: number; fh?: number }): { frame: Raster; grid: ProjectionGrid } {
  const fw = opts.fw ?? 400, fh = opts.fh ?? 300;
  const data = new Uint8Array(fw * fh * 4);
  for (let i = 0; i < fw * fh; i++) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 90; data[i * 4 + 3] = 255; }
  const w = Math.round(label.width * opts.scale), h = Math.round(label.height * opts.scale);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = Math.min(label.width - 1, Math.floor(x / opts.scale)), sy = Math.min(label.height - 1, Math.floor(y / opts.scale));
    const so = (sy * label.width + sx) * 4, o = ((opts.y + y) * fw + opts.x + x) * 4;
    for (let c = 0; c < 3; c++) data[o + c] = Math.max(0, Math.min(255, label.data[so + c]! * (opts.gain ?? 1) + (opts.bias ?? 0)));
  }
  const cols = 5, rows = 3;
  const px: number[] = [], py: number[] = [], facing: number[] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    px.push(opts.x + (i / (cols - 1)) * w);
    py.push(opts.y + (j / (rows - 1)) * h);
    facing.push(1);
  }
  return { frame: { width: fw, height: fh, data }, grid: { cols, rows, px, py, facing } };
}

describe('png', () => {
  it('encode → decode giữ nguyên điểm ảnh', () => {
    const l = makeLabel(33, 17, 3);
    const d = decodePng(encodePng(l));
    expect(d.width).toBe(33);
    expect(Buffer.from(d.data).equals(Buffer.from(l.data))).toBe(true);
  });
  it('từ chối dữ liệu không phải PNG', () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]))).toThrow();
  });
});

describe('ssim', () => {
  const a = toGray(makeLabel(96, 48, 5));
  it('ảnh giống nhau → 1', () => expect(ssim(a, a).score).toBeCloseTo(1, 5));
  it('nhãn khác hẳn → thấp', () => {
    const b = toGray(makeLabel(96, 48, 99));
    expect(ssim(normalizeGray(a), normalizeGray(b)).score).toBeLessThan(0.4);
  });
  it('tăng sáng/tương phản toàn cục không đổi điểm sau chuẩn hóa', () => {
    const b = { ...a, data: a.data.map((v) => v * 0.6 + 20) };
    expect(ssim(normalizeGray(a), normalizeGray(b)).score).toBeGreaterThan(0.95);
  });
  it('resize giữ mặt nạ chỉ ở ô hợp lệ', () => {
    const g = toGray({ width: 4, height: 4, data: new Uint8Array(64).fill(255) }, 0.9);
    g.mask[0] = 0;
    const r = resizeGray(g, 2, 2);
    expect([...r.mask]).toEqual([0, 1, 1, 1]);
  });
});

describe('assessLabelFrame', () => {
  const label = makeLabel();
  it('nhãn đặt đúng, đổi sáng/tỉ lệ → đạt', () => {
    const { frame, grid } = frameWith(label, { x: 60, y: 50, scale: 0.9, gain: 0.7, bias: 25 });
    const r = assessLabelFrame({ frame, label, grid });
    expect(r.verdict).toBe('pass');
    expect(r.ssim).toBeGreaterThan(0.8);
  });
  it('nhãn sai/thiếu trong khung → fail', () => {
    const { frame, grid } = frameWith(makeLabel(240, 120, 77), { x: 60, y: 50, scale: 0.9 });
    expect(assessLabelFrame({ frame, label, grid }).verdict).toBe('fail');
  });
  it('lệch vị trí lưới → fail (bắt lỗi chiếu sai)', () => {
    const { frame, grid } = frameWith(label, { x: 60, y: 50, scale: 0.9 });
    const shifted = { ...grid, px: grid.px.map((v) => v + 12) };
    expect(assessLabelFrame({ frame, label, grid: shifted }).verdict).toBe('fail');
  });
  it('nghiêng quá ngưỡng đọc → tilted; quay lưng → hidden', () => {
    const { frame, grid } = frameWith(label, { x: 60, y: 50, scale: 0.9 });
    const tilt = { ...grid, facing: grid.facing.map(() => Math.cos((65 * Math.PI) / 180)) };
    expect(assessLabelFrame({ frame, label, grid: tilt }).verdict).toBe('tilted');
    const back = { ...grid, facing: grid.facing.map(() => -0.5) };
    expect(assessLabelFrame({ frame, label, grid: back }).verdict).toBe('hidden');
  });
  it('OCR từng khung chỉ được ghi nhận, không tự làm fail khung', () => {
    const { frame, grid } = frameWith(label, { x: 60, y: 50, scale: 0.9 });
    const r = assessLabelFrame({ frame, label, grid, ocrText: { expected: 'Serum Vitamin', recognized: 'zzz qqq' } });
    expect(r.verdict).toBe('pass');
    expect(r.ocr).toBe(0);
  });
});

describe('ocrMatchRatio', () => {
  it('bỏ dấu, hoa/thường, cho phép sai 1 ký tự', () => {
    expect(ocrMatchRatio('Tinh chất DƯỠNG ẩm', 'tinh chat duong am')).toBe(1);
    expect(ocrMatchRatio('Serum Vitamin', 'Serum Vitamln')).toBe(1);
    expect(ocrMatchRatio('Serum Vitamin', 'Serum')).toBe(0.5);
  });
});

describe('summarizeSweep', () => {
  const f = (verdict: 'pass' | 'fail' | 'tilted' | 'hidden') => ({ verdict, ssim: 0, ssimCoverage: 1, tiltDeg: 0, visible: 1, reasons: [] });
  it('đạt khi ≥90% khung xét được đạt, khung nghiêng gây cảnh báo', () => {
    const frames = [...Array(9).fill(0).map(() => f('pass')), f('fail'), f('tilted'), f('hidden'), f('hidden')];
    const s = summarizeSweep(frames);
    expect(s.productPass).toBe(true);
    expect(s.warnings.join()).toMatch(/nghiêng/);
  });
  it('OCR tốt nhất của cả vòng xoay phải đạt ngưỡng; một khung nhiễu không làm rớt', () => {
    const withOcr = (ocr: number) => ({ ...f('pass'), ocr });
    expect(summarizeSweep([withOcr(0.1), withOcr(0.7), withOcr(0.1), withOcr(0.1)]).productPass).toBe(true);
    const bad = summarizeSweep([withOcr(0), withOcr(0.1), withOcr(0.2), withOcr(0.1)]);
    expect(bad.productPass).toBe(false);
    expect(bad.warnings.join()).toMatch(/OCR/);
  });
  it('không đạt khi nhiều khung fail hoặc hầu như không thấy nhãn', () => {
    expect(summarizeSweep([f('pass'), f('fail')]).productPass).toBe(false);
    expect(summarizeSweep(Array(10).fill(0).map(() => f('hidden'))).productPass).toBe(false);
  });
});
