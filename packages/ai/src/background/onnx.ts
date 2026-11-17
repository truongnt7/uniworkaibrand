import { existsSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-node';
import sharp from 'sharp';
import { BACKGROUND_MODELS, type BackgroundModelId, type BackgroundModelSpec } from './models.js';
import { predictionToMask, rgbToTensor } from './tensor.js';
import type { BackgroundRemovalResult, BackgroundRemover } from './types.js';

export interface OnnxRemoverOptions {
  model?: BackgroundModelId;
  /** Đường dẫn file .onnx; mặc định env APS_BG_MODEL_PATH hoặc packages/ai/models/<file>. */
  modelPath?: string;
  /** Số luồng CPU; mặc định env APS_BG_THREADS hoặc số lõi khả dụng. */
  threads?: number;
}

export function defaultModelPath(spec: BackgroundModelSpec, env: Record<string, string | undefined> = process.env): string {
  if (env.APS_BG_MODEL_PATH) return env.APS_BG_MODEL_PATH;
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../models', spec.fileName);
}

export class BackgroundModelMissingError extends Error {
  constructor(readonly modelPath: string) {
    super(`Chưa có model tách nền tại ${modelPath}. Chạy: pnpm --filter @aps/ai bg:download`);
    this.name = 'BackgroundModelMissingError';
  }
}

/** Tách nền local trên CPU bằng onnxruntime-node + sharp. Không gửi ảnh ra mạng. */
export class OnnxBackgroundRemover implements BackgroundRemover {
  readonly id: string;
  readonly modelLicense: string;
  private session: ort.InferenceSession | undefined;
  private readonly spec: BackgroundModelSpec;
  private readonly modelPath: string;
  private readonly threads: number;

  constructor(opts: OnnxRemoverOptions = {}) {
    this.spec = BACKGROUND_MODELS[opts.model ?? 'u2netp'];
    this.id = `onnx:${this.spec.id}`;
    this.modelLicense = this.spec.modelLicense;
    this.modelPath = opts.modelPath ?? defaultModelPath(this.spec);
    this.threads = opts.threads ?? (Number(process.env.APS_BG_THREADS) || availableParallelism());
  }

  private async load(): Promise<ort.InferenceSession> {
    if (this.session) return this.session;
    if (!existsSync(this.modelPath)) throw new BackgroundModelMissingError(this.modelPath);
    this.session = await ort.InferenceSession.create(this.modelPath, {
      executionProviders: ['cpu'],
      intraOpNumThreads: this.threads,
      graphOptimizationLevel: 'all',
    });
    return this.session;
  }

  /** Nạp model trước (để đo thời gian suy luận tách khỏi thời gian khởi tạo). */
  async warmup(): Promise<void> {
    await this.load();
  }

  async removeBackground(image: Buffer | string): Promise<BackgroundRemovalResult> {
    const t0 = performance.now();
    const session = await this.load();
    const size = this.spec.inputSize;

    // rotate() áp dụng EXIF để ảnh chụp từ điện thoại không bị lật.
    const oriented = await sharp(image).rotate().removeAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    const width = oriented.info.width;
    const height = oriented.info.height;
    const t1 = performance.now();

    const small = await sharp(oriented.data, { raw: { width, height, channels: 3 } })
      .resize(size, size, { fit: 'fill', kernel: 'lanczos3' })
      .raw()
      .toBuffer();
    const input = rgbToTensor(small, this.spec);
    const t2 = performance.now();

    const feeds = { [session.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, size, size]) };
    const outputs = await session.run(feeds);
    const first = outputs[session.outputNames[0]!]!;
    const pred = first.data as Float32Array;
    const t3 = performance.now();

    const smallMask = predictionToMask(pred, this.spec.sigmoid);
    const mask = await sharp(smallMask, { raw: { width: size, height: size, channels: 1 } })
      .resize(width, height, { fit: 'fill', kernel: 'lanczos3' })
      .extractChannel(0)
      .raw()
      .toBuffer();
    const png = await sharp(oriented.data, { raw: { width, height, channels: 3 } })
      .joinChannel(mask, { raw: { width, height, channels: 1 } })
      .png()
      .toBuffer();
    const t4 = performance.now();

    return {
      png,
      mask,
      width,
      height,
      timings: {
        decodeMs: t1 - t0,
        preprocessMs: t2 - t1,
        inferenceMs: t3 - t2,
        postprocessMs: t4 - t3,
        totalMs: t4 - t0,
      },
    };
  }

  async dispose(): Promise<void> {
    await this.session?.release();
    this.session = undefined;
  }
}
