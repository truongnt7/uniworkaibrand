import { createHash } from 'node:crypto';
import { mkdir, open, stat } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Worker } from 'node:worker_threads';
import { AppError } from '@aps/shared';
import { HEIC_EXTENSIONS, MAX_HEIC_BYTES, convertHeicFile, looksLikeHeic, type ConvertResult } from './heic.js';

export interface PreparedPhoto {
  path: string;
  converted: boolean;
}

export type HeicConverter = (src: string, dest: string) => Promise<ConvertResult>;

/** Chạy chuyển đổi trong một worker thread (tệp worker được bundle cùng orchestrator). */
export function workerConverter(workerFile: string): HeicConverter {
  return (src, dest) =>
    new Promise<ConvertResult>((resolve, reject) => {
      const worker = new Worker(workerFile, { workerData: { src, dest } });
      let settled = false;
      const done = (fn: () => void) => {
        if (settled) return;
        settled = true;
        fn();
      };
      worker.once('message', (m: { ok: boolean; code?: string; message?: string; width?: number; height?: number }) => {
        done(() => (m.ok ? resolve({ width: m.width ?? 0, height: m.height ?? 0 }) : reject(new AppError(m.code ?? 'PHOTO_HEIC_FAILED', m.message ?? 'lỗi chuyển ảnh'))));
      });
      worker.once('error', (e) => done(() => reject(new AppError('PHOTO_HEIC_FAILED', e.message))));
      worker.once('exit', (code) => done(() => reject(new AppError('PHOTO_HEIC_FAILED', `luồng chuyển ảnh dừng bất thường (mã ${code})`))));
    });
}

/**
 * Chuẩn bị ảnh người dùng vừa tải lên: HEIC/HEIF (theo đuôi tệp hoặc theo nội dung) được chuyển sang JPG, lưu trong `dir`
 * (thư mục dữ liệu của app) nên bền cả khi tệp gốc bị xoá; ảnh khác giữ nguyên đường dẫn. Mỗi lần chỉ chuyển một ảnh để giới hạn bộ nhớ.
 */
export class PhotoPreparer {
  private readonly inflight = new Map<string, Promise<PreparedPhoto>>();
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly dir: string,
    private readonly convert: HeicConverter = (src, dest) => convertHeicFile(src, dest),
  ) {}

  async prepare(path: string): Promise<PreparedPhoto> {
    const info = await stat(path).catch(() => null);
    if (!info || !info.isFile()) return { path, converted: false };
    if (!(await this.isHeic(path))) return { path, converted: false };
    if (info.size > MAX_HEIC_BYTES) throw new AppError('PHOTO_TOO_LARGE', `ảnh ${info.size} byte vượt giới hạn ${MAX_HEIC_BYTES}`);
    const key = createHash('sha256').update(`${path}\0${info.size}\0${Math.floor(info.mtimeMs)}`).digest('hex').slice(0, 32);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const job = this.run(path, join(this.dir, `${key}.jpg`));
    this.inflight.set(key, job);
    void job.then(
      () => this.inflight.delete(key),
      () => this.inflight.delete(key),
    );
    return job;
  }

  private run(src: string, dest: string): Promise<PreparedPhoto> {
    const task = this.chain.then(async (): Promise<PreparedPhoto> => {
      const done = await stat(dest).catch(() => null);
      if (done && done.size > 0) return { path: dest, converted: true };
      await mkdir(this.dir, { recursive: true });
      await this.convert(src, dest);
      return { path: dest, converted: true };
    });
    this.chain = task.catch(() => undefined);
    return task;
  }

  private async isHeic(path: string): Promise<boolean> {
    if (HEIC_EXTENSIONS.has(extname(path).toLowerCase())) return true;
    const fh = await open(path, 'r').catch(() => null);
    if (!fh) return false;
    try {
      const buf = Buffer.alloc(64);
      const { bytesRead } = await fh.read(buf, 0, 64, 0);
      return looksLikeHeic(buf.subarray(0, bytesRead));
    } finally {
      await fh.close();
    }
  }
}
