import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { BACKGROUND_MODELS, BackgroundModelMissingError, OnnxBackgroundRemover, defaultModelPath, predictionToMask, rgbToTensor } from '../src/background/index.js';
import { iou, syntheticBottle } from './helpers/synthetic-bottle.js';

describe('tách nền: tiền/hậu xử lý (thuần hàm)', () => {
  const spec = { inputSize: 2, mean: [0.5, 0.5, 0.5] as [number, number, number], std: [0.5, 0.5, 0.5] as [number, number, number], divideByMax: false };

  it('rgbToTensor: bố cục CHW và chuẩn hoá', () => {
    const rgb = Uint8Array.from([255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255]);
    const t = rgbToTensor(rgb, spec);
    expect(Array.from(t.slice(0, 4))).toEqual([1, -1, -1, 1]);
    expect(Array.from(t.slice(4, 8))).toEqual([-1, 1, -1, 1]);
    expect(() => rgbToTensor(new Uint8Array(5), spec)).toThrow();
  });

  it('rgbToTensor: divideByMax không chia cho 0', () => {
    const t = rgbToTensor(new Uint8Array(12), { ...spec, divideByMax: true });
    expect(t.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('predictionToMask: min-max và sigmoid', () => {
    expect(Array.from(predictionToMask(Float32Array.from([2, 4, 6]), false))).toEqual([0, 128, 255]);
    expect(Array.from(predictionToMask(Float32Array.from([-20, 0, 20]), true))).toEqual([0, 128, 255]);
    expect(Array.from(predictionToMask(Float32Array.from([3, 3]), false))).toEqual([0, 0]);
  });

  it('metadata model có giấy phép và sha256', () => {
    for (const m of Object.values(BACKGROUND_MODELS)) {
      expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(m.modelLicense).toMatch(/Apache-2.0|MIT/);
    }
    expect(Object.values(BACKGROUND_MODELS).some((m) => /BRIA|RMBG/i.test(m.modelLicense + m.source))).toBe(false);
  });
});

describe('tách nền: thiếu model', () => {
  it('báo lỗi hướng dẫn tải', async () => {
    const r = new OnnxBackgroundRemover({ modelPath: '/không/tồn/tại.onnx' });
    await expect(r.removeBackground(Buffer.alloc(0))).rejects.toBeInstanceOf(BackgroundModelMissingError);
  });
});

// Tích hợp thật: chỉ chạy khi đã tải model (pnpm --filter @aps/ai bg:download). CI mặc định bỏ qua.
const u2 = defaultModelPath(BACKGROUND_MODELS.u2netp);
describe.skipIf(!existsSync(u2))('tách nền local u2netp (CPU, ảnh tổng hợp)', () => {
  it('ra PNG RGBA cùng kích thước, giữ nguyên pixel sản phẩm, mask khớp hình chai', async () => {
    const { image, truth } = await syntheticBottle(800, 1000);
    const remover = new OnnxBackgroundRemover({ model: 'u2netp' });
    const res = await remover.removeBackground(image);
    expect(res.width).toBe(800);
    expect(res.height).toBe(1000);
    expect(res.mask.length).toBe(800 * 1000);
    expect(iou(res.mask, truth)).toBeGreaterThan(0.8);

    const out = await sharp(res.png).raw().toBuffer({ resolveWithObject: true });
    expect(out.info.channels).toBe(4);
    const src = await sharp(image).removeAlpha().raw().toBuffer();
    // Chính sách giữ nhãn: RGB đầu ra phải bằng RGB ảnh gốc từng byte (AI chỉ tạo alpha).
    let diff = 0;
    for (let i = 0, p = 0; i < src.length; i += 3, p += 4) {
      if (src[i] !== out.data[p] || src[i + 1] !== out.data[p + 1] || src[i + 2] !== out.data[p + 2]) diff++;
    }
    expect(diff).toBe(0);
    await remover.dispose();
  }, 60_000);
});
