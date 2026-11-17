import type { Raster } from './png.js';

/** Ảnh xám float [0..255] kèm mặt nạ (1 = dùng điểm ảnh này). */
export interface Gray {
  width: number;
  height: number;
  data: Float32Array;
  mask: Uint8Array;
}

/** Chuyển RGBA sang xám (Rec.601). Pixel alpha < `alphaMin` bị che khỏi phép so sánh; nền trong suốt không làm lệch kết quả. */
export function toGray(r: Raster, alphaMin = 0.9): Gray {
  const n = r.width * r.height;
  const data = new Float32Array(n);
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    data[i] = 0.299 * r.data[o]! + 0.587 * r.data[o + 1]! + 0.114 * r.data[o + 2]!;
    mask[i] = r.data[o + 3]! / 255 >= alphaMin ? 1 : 0;
  }
  return { width: r.width, height: r.height, data, mask };
}

/** Thu nhỏ bằng trung bình hộp (area average); mặt nạ chỉ giữ ô mà mọi pixel nguồn đều hợp lệ. */
export function resizeGray(g: Gray, w: number, h: number): Gray {
  if (w === g.width && h === g.height) return g;
  const data = new Float32Array(w * h);
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = (y * g.height) / h;
    const y1 = ((y + 1) * g.height) / h;
    for (let x = 0; x < w; x++) {
      const x0 = (x * g.width) / w;
      const x1 = ((x + 1) * g.width) / w;
      let sum = 0;
      let wsum = 0;
      let valid = 1;
      for (let yy = Math.floor(y0); yy < Math.min(g.height, Math.ceil(y1)); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.min(g.width, Math.ceil(x1)); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0);
          const wgt = wx * wy;
          sum += g.data[yy * g.width + xx]! * wgt;
          wsum += wgt;
          if (!g.mask[yy * g.width + xx]) valid = 0;
        }
      }
      data[y * w + x] = wsum ? sum / wsum : 0;
      mask[y * w + x] = valid;
    }
  }
  return { width: w, height: h, data, mask };
}

const L = 255;
const C1 = (0.01 * L) ** 2;
const C2 = (0.03 * L) ** 2;

/**
 * SSIM trung bình theo cửa sổ vuông đồng đều `win`×`win` (bước 1). Chỉ tính ở cửa sổ mà mọi pixel của CẢ HAI ảnh hợp lệ.
 * Trả về `valid` = tỉ lệ cửa sổ tính được, để người gọi biết phần nhãn đủ thấy hay không.
 */
export function ssim(a: Gray, b: Gray, win = 7): { score: number; valid: number } {
  if (a.width !== b.width || a.height !== b.height) throw new Error('ssim: hai ảnh khác kích thước');
  const { width: w, height: h } = a;
  if (w < win || h < win) return { score: 0, valid: 0 };
  const n = win * win;
  let total = 0;
  let count = 0;
  let windows = 0;
  for (let y = 0; y + win <= h; y++) {
    for (let x = 0; x + win <= w; x++) {
      windows++;
      let ok = true;
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
      for (let j = 0; j < win && ok; j++) {
        const row = (y + j) * w + x;
        for (let i = 0; i < win; i++) {
          const k = row + i;
          if (!a.mask[k] || !b.mask[k]) { ok = false; break; }
          const va = a.data[k]!;
          const vb = b.data[k]!;
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
      }
      if (!ok) continue;
      const ma = sa / n;
      const mb = sb / n;
      const va = (saa - n * ma * ma) / (n - 1);
      const vb = (sbb - n * mb * mb) / (n - 1);
      const cov = (sab - n * ma * mb) / (n - 1);
      total += ((2 * ma * mb + C1) * (2 * cov + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count++;
    }
  }
  return { score: count ? total / count : 0, valid: windows ? count / windows : 0 };
}

/** Chuẩn hóa độ sáng/tương phản toàn cục (z-score) để bù chiếu sáng/bóng đổ trước khi so SSIM. */
export function normalizeGray(g: Gray): Gray {
  let s = 0, ss = 0, n = 0;
  for (let i = 0; i < g.data.length; i++) {
    if (!g.mask[i]) continue;
    s += g.data[i]!; ss += g.data[i]! * g.data[i]!; n++;
  }
  if (!n) return g;
  const m = s / n;
  const sd = Math.sqrt(Math.max(ss / n - m * m, 1e-6));
  const out = new Float32Array(g.data.length);
  for (let i = 0; i < out.length; i++) out[i] = Math.min(255, Math.max(0, ((g.data[i]! - m) / sd) * 48 + 128));
  return { ...g, data: out };
}
