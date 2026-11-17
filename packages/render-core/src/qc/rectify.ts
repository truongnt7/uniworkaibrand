import type { Raster } from './png.js';
import type { Gray } from './ssim.js';

/**
 * Lưới điểm chiếu của nhãn vào khung hình (do worker Blender xuất bằng world_to_camera_view).
 * Hàng 0 là mép TRÊN nhãn (v=1), cột 0 là mép TRÁI nhãn (u=0). Toạ độ pixel gốc ở góc trên-trái ảnh.
 * `facing` = cos(góc giữa pháp tuyến bề mặt và hướng tới camera): 1 = đối diện, 0 = song song tầm nhìn, <0 = mặt sau.
 */
export interface ProjectionGrid {
  cols: number;
  rows: number;
  px: number[];
  py: number[];
  facing: number[];
}

export const MIN_RECTIFY_FACING = Math.cos((75 * Math.PI) / 180);

function bilerp(v: number[], cols: number, fx: number, fy: number): number {
  const x0 = Math.min(cols - 2, Math.max(0, Math.floor(fx)));
  const y0 = Math.max(0, Math.floor(fy));
  const tx = fx - x0;
  const ty = fy - y0;
  const rows = v.length / cols;
  const y1 = Math.min(rows - 1, y0 + 1);
  const a = v[y0 * cols + x0]! * (1 - tx) + v[y0 * cols + x0 + 1]! * tx;
  const b = v[y1 * cols + x0]! * (1 - tx) + v[y1 * cols + x0 + 1]! * tx;
  return a * (1 - ty) + b * ty;
}

function sampleGray(g: { width: number; height: number; data: Float32Array }, x: number, y: number): number | null {
  if (x < 0 || y < 0 || x > g.width - 1 || y > g.height - 1) return null;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(g.width - 1, x0 + 1);
  const y1 = Math.min(g.height - 1, y0 + 1);
  const tx = x - x0;
  const ty = y - y0;
  const d = g.data;
  const w = g.width;
  return (d[y0 * w + x0]! * (1 - tx) + d[y0 * w + x1]! * tx) * (1 - ty) + (d[y1 * w + x0]! * (1 - tx) + d[y1 * w + x1]! * tx) * ty;
}

/** "Nắn phẳng" vùng nhãn trong khung về hình chữ nhật outW×outH theo lưới chiếu. Điểm quay lưng/ngoài ảnh bị che. */
export function rectifyLabel(frame: Gray, grid: ProjectionGrid, outW: number, outH: number, minFacing = MIN_RECTIFY_FACING): Gray {
  const data = new Float32Array(outW * outH);
  const mask = new Uint8Array(outW * outH);
  for (let y = 0; y < outH; y++) {
    const fy = ((y + 0.5) / outH) * (grid.rows - 1);
    for (let x = 0; x < outW; x++) {
      const fx = ((x + 0.5) / outW) * (grid.cols - 1);
      const facing = bilerp(grid.facing, grid.cols, fx, fy);
      if (facing < minFacing) continue;
      const v = sampleGray(frame, bilerp(grid.px, grid.cols, fx, fy), bilerp(grid.py, grid.cols, fx, fy));
      if (v === null) continue;
      data[y * outW + x] = v;
      mask[y * outW + x] = 1;
    }
  }
  return { width: outW, height: outH, data, mask };
}

export function grayToRaster(g: Gray, invertMaskedTo = 255): Raster {
  const data = new Uint8Array(g.width * g.height * 4);
  for (let i = 0; i < g.data.length; i++) {
    const v = g.mask[i] ? Math.round(g.data[i]!) : invertMaskedTo;
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = 255;
  }
  return { width: g.width, height: g.height, data };
}

/** Góc (độ) giữa pháp tuyến nhãn và hướng camera, lấy ở tâm lưới. */
export function centerTiltDeg(grid: ProjectionGrid): number {
  const c = bilerp(grid.facing, grid.cols, (grid.cols - 1) / 2, (grid.rows - 1) / 2);
  return (Math.acos(Math.min(1, Math.max(-1, c))) * 180) / Math.PI;
}

/** Tỉ lệ diện tích nhãn có thể nhìn thấy (quay mặt về camera trong ngưỡng đọc được). */
export function visibleFraction(grid: ProjectionGrid, minFacing = MIN_RECTIFY_FACING): number {
  let n = 0;
  for (const f of grid.facing) if (f >= minFacing) n++;
  return grid.facing.length ? n / grid.facing.length : 0;
}
