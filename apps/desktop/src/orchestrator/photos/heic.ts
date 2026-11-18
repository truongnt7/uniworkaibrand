import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { AppError } from '@aps/shared';
import decodeHeic from 'heic-decode';
import { encode as encodeJpeg } from 'jpeg-js';

/**
 * Chuyển ảnh HEIC/HEIF sang JPG.
 *
 * Thư viện: `heic-decode` (ISC) bọc `libheif-js` (LGPL-3.0, libheif + libde265 biên dịch ra WebAssembly) để giải mã; `jpeg-js` (BSD-3-Clause) để mã hóa JPG.
 * Chạy hoàn toàn bằng JS/WASM (không native module cần rebuild, không phụ thuộc codec của hệ điều hành, giống nhau ở Windows/macOS/Linux).
 * libheif áp dụng sẵn phép xoay/lật (irot/imir) nên ảnh iPhone chụp dọc ra đúng chiều; JPG ghi ra không còn EXIF.
 * Xem THIRD_PARTY_NOTICES.md (mục "Chuyển ảnh HEIC") về nghĩa vụ LGPL và bằng sáng chế HEVC.
 */
export const HEIC_EXTENSIONS: ReadonlySet<string> = new Set(['.heic', '.heif', '.hif']);
export const MAX_HEIC_BYTES = 120 * 1024 * 1024;
export const DEFAULT_MAX_SIDE = 3840;
export const DEFAULT_JPEG_QUALITY = 90;

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

/** Nhận diện bằng nội dung (ftyp), phòng ảnh HEIC bị đổi đuôi .jpg khi chia sẻ qua ứng dụng khác. */
export function looksLikeHeic(head: Uint8Array): boolean {
  if (head.length < 12) return false;
  const ascii = (a: number, b: number) => String.fromCharCode(...head.subarray(a, b));
  if (ascii(4, 8) !== 'ftyp') return false;
  if (HEIF_BRANDS.has(ascii(8, 12))) return true;
  for (let o = 16; o + 4 <= Math.min(head.length, 64); o += 4) if (HEIF_BRANDS.has(ascii(o, o + 4))) return true;
  return false;
}

export interface ConvertOptions {
  maxSide?: number;
  quality?: number;
}

export interface ConvertResult {
  width: number;
  height: number;
}

/** Thu nhỏ bằng trung bình theo vùng (box filter): đủ nhanh và không răng cưa cho ảnh chụp. */
export function resizeRgba(src: Uint8ClampedArray | Uint8Array, w: number, h: number, nw: number, nh: number): Uint8Array {
  const out = new Uint8Array(nw * nh * 4);
  const kx = w / nw;
  const ky = h / nh;
  for (let y = 0; y < nh; y++) {
    const y0 = Math.floor(y * ky);
    const y1 = Math.max(y0 + 1, Math.min(h, Math.floor((y + 1) * ky)));
    for (let x = 0; x < nw; x++) {
      const x0 = Math.floor(x * kx);
      const x1 = Math.max(x0 + 1, Math.min(w, Math.floor((x + 1) * kx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * w + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += src[i]!;
          g += src[i + 1]!;
          b += src[i + 2]!;
          a += src[i + 3]!;
        }
      }
      const n = (y1 - y0) * (x1 - x0);
      const o = (y * nw + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

/** Ảnh có kênh alpha (hiếm với HEIC) được đặt lên nền trắng vì JPG không có độ trong suốt. */
function flattenOnWhite(data: Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]!;
    if (a === 255) continue;
    const k = a / 255;
    data[i] = Math.round(data[i]! * k + 255 * (1 - k));
    data[i + 1] = Math.round(data[i + 1]! * k + 255 * (1 - k));
    data[i + 2] = Math.round(data[i + 2]! * k + 255 * (1 - k));
    data[i + 3] = 255;
  }
}

export async function convertHeicBuffer(input: Uint8Array, opts: ConvertOptions = {}): Promise<{ jpeg: Uint8Array } & ConvertResult> {
  let decoded;
  try {
    decoded = await decodeHeic({ buffer: input });
  } catch (err) {
    throw new AppError('PHOTO_HEIC_FAILED', `không giải mã được ảnh HEIC: ${err instanceof Error ? err.message : String(err)}`);
  }
  let { width, height } = decoded;
  if (!(width > 0 && height > 0) || decoded.data.length < width * height * 4) throw new AppError('PHOTO_HEIC_FAILED', 'ảnh HEIC không có dữ liệu điểm ảnh hợp lệ');
  const maxSide = opts.maxSide ?? DEFAULT_MAX_SIDE;
  let rgba: Uint8Array = new Uint8Array(decoded.data.buffer, decoded.data.byteOffset, width * height * 4);
  const long = Math.max(width, height);
  if (long > maxSide) {
    const k = maxSide / long;
    const nw = Math.max(1, Math.round(width * k));
    const nh = Math.max(1, Math.round(height * k));
    rgba = resizeRgba(rgba, width, height, nw, nh);
    width = nw;
    height = nh;
  } else {
    rgba = new Uint8Array(rgba);
  }
  flattenOnWhite(rgba);
  const jpeg = encodeJpeg({ data: rgba, width, height }, opts.quality ?? DEFAULT_JPEG_QUALITY).data;
  return { jpeg, width, height };
}

/** Đọc `src` (HEIC), ghi JPG vào `dest` qua tệp tạm rồi đổi tên (không bao giờ để lại JPG dở dang). */
export async function convertHeicFile(src: string, dest: string, opts: ConvertOptions = {}): Promise<ConvertResult> {
  const input = await readFile(src);
  const { jpeg, width, height } = await convertHeicBuffer(input, opts);
  const part = `${dest}.part`;
  try {
    await writeFile(part, jpeg);
    await rename(part, dest);
  } catch (err) {
    await rm(part, { force: true });
    throw new AppError('PHOTO_HEIC_FAILED', `không ghi được ảnh JPG: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { width, height };
}
