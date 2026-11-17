import type { BackgroundModelSpec } from './models.js';

/** RGB interleaved (size×size×3, uint8) → float32 CHW đã chuẩn hoá theo spec. Thuần hàm, dễ test. */
export function rgbToTensor(rgb: Uint8Array, spec: Pick<BackgroundModelSpec, 'inputSize' | 'mean' | 'std' | 'divideByMax'>): Float32Array {
  const n = spec.inputSize * spec.inputSize;
  if (rgb.length !== n * 3) throw new Error(`rgb có ${rgb.length} byte, cần ${n * 3}`);
  let max = 255;
  if (spec.divideByMax) {
    max = 0;
    for (let i = 0; i < rgb.length; i++) if (rgb[i]! > max) max = rgb[i]!;
    if (max === 0) max = 1;
  }
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * n + i] = (rgb[i * 3 + c]! / max - spec.mean[c]!) / spec.std[c]!;
    }
  }
  return out;
}

/** Đầu ra model → mask uint8 (0..255). */
export function predictionToMask(pred: Float32Array, sigmoid: boolean): Uint8Array {
  const out = new Uint8Array(pred.length);
  if (sigmoid) {
    for (let i = 0; i < pred.length; i++) out[i] = Math.round(255 / (1 + Math.exp(-pred[i]!)));
    return out;
  }
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < pred.length; i++) {
    const v = pred[i]!;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo || 1;
  for (let i = 0; i < pred.length; i++) out[i] = Math.round(((pred[i]! - lo) / range) * 255);
  return out;
}
