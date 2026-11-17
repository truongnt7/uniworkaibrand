import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat, statfs } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { AppError } from '@aps/shared';

export interface DownloadProgress {
  receivedBytes: number;
  totalBytes: number;
  bytesPerSecond: number;
}

export interface RetryInfo {
  attempt: number;
  maxAttempts: number;
  error: AppError;
  waitMs: number;
}

export interface DownloadOptions {
  urls: string[];
  dest: string;
  sha256: string;
  size: number;
  maxAttempts?: number;
  /** Chờ trước lần thử thứ `attempt` (1-based, tính từ lần thử lại đầu tiên). */
  backoffMs?: (attempt: number) => number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  fetchImpl?: typeof fetch;
  onProgress?: (p: DownloadProgress) => void;
  onVerifying?: () => void;
  onRetry?: (info: RetryInfo) => void;
  signal?: AbortSignal;
}

const FATAL_CODES = new Set(['DISK_SPACE', 'CANCELED']);

export function defaultBackoff(attempt: number): number {
  return Math.min(30_000, 1000 * 2 ** (attempt - 1));
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError('CANCELED', 'canceled'));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new AppError('CANCELED', 'canceled'));
      },
      { once: true },
    );
  });
}

export async function sha256File(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** Kiểm tra chỗ trống trên ổ chứa `dir` trước khi tải/giải nén. */
export async function ensureDiskSpace(
  dir: string,
  neededBytes: number,
  statfsImpl: (p: string) => Promise<{ bavail: bigint | number; bsize: bigint | number }> = (p) => statfs(p),
): Promise<void> {
  await mkdir(dir, { recursive: true });
  const s = await statfsImpl(dir);
  const free = Number(s.bavail) * Number(s.bsize);
  if (free < neededBytes) {
    throw new AppError('DISK_SPACE', `cần ${neededBytes} byte, còn trống ${free} byte`, { neededBytes, freeBytes: free });
  }
}

async function partSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

/**
 * Tải file có tiếp tục (HTTP Range), thử lại với backoff, xoay vòng mirror, kiểm kích thước + sha256.
 * File chỉ xuất hiện ở `dest` sau khi đã được xác minh (tải vào `dest.part`).
 */
export async function downloadVerified(opts: DownloadOptions): Promise<void> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const backoff = opts.backoffMs ?? defaultBackoff;
  const sleep = opts.sleep ?? defaultSleep;
  const part = `${opts.dest}.part`;
  await mkdir(dirname(opts.dest), { recursive: true });

  let lastError: AppError | null = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.signal?.aborted) throw new AppError('CANCELED', 'canceled');
    const url = opts.urls[(attempt - 1) % opts.urls.length] as string;
    try {
      await fetchIntoPart(url, part, opts);
      const size = await partSize(part);
      if (size !== opts.size) {
        if (size > opts.size) await rm(part, { force: true });
        throw new AppError('SIZE_MISMATCH', `kích thước ${size} khác kỳ vọng ${opts.size}`);
      }
      opts.onVerifying?.();
      const digest = await sha256File(part);
      if (digest !== opts.sha256) {
        await rm(part, { force: true });
        throw new AppError('CHECKSUM_MISMATCH', `sha256 ${digest} khác kỳ vọng ${opts.sha256}`);
      }
      await rm(opts.dest, { force: true });
      await rename(part, opts.dest);
      return;
    } catch (err) {
      const appErr = toAppError(err);
      if (FATAL_CODES.has(appErr.code)) {
        if (appErr.code === 'DISK_SPACE') await rm(part, { force: true });
        throw appErr;
      }
      lastError = appErr;
      if (attempt === maxAttempts) break;
      const waitMs = backoff(attempt);
      opts.onRetry?.({ attempt: attempt + 1, maxAttempts, error: appErr, waitMs });
      await sleep(waitMs, opts.signal);
    }
  }
  throw lastError ?? new AppError('NETWORK', 'tải thất bại');
}

function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const e = err as NodeJS.ErrnoException & { cause?: NodeJS.ErrnoException };
  if (e?.code === 'ENOSPC' || e?.cause?.code === 'ENOSPC') return new AppError('DISK_SPACE', 'hết dung lượng đĩa');
  if (e?.name === 'AbortError') return new AppError('CANCELED', 'canceled');
  return new AppError('NETWORK', e?.cause?.message ?? e?.message ?? String(err));
}

async function fetchIntoPart(url: string, part: string, opts: DownloadOptions): Promise<void> {
  const doFetch = opts.fetchImpl ?? fetch;
  let existing = await partSize(part);
  if (existing > opts.size) {
    await rm(part, { force: true });
    existing = 0;
  }
  if (existing === opts.size) return;

  const headers: Record<string, string> = {};
  if (existing > 0) headers.Range = `bytes=${existing}-`;
  const res = await doFetch(url, { headers, signal: opts.signal ?? null, redirect: 'follow' });

  if (res.status === 416) {
    await rm(part, { force: true });
    throw new AppError('HTTP_STATUS', 'máy chủ từ chối Range (416), sẽ tải lại từ đầu', { status: 416 });
  }
  if (res.status !== 200 && res.status !== 206) {
    throw new AppError('HTTP_STATUS', `HTTP ${res.status} từ ${url}`, { status: res.status });
  }
  let offset = existing;
  if (res.status === 200 && existing > 0) {
    // Máy chủ không hỗ trợ Range: bỏ phần cũ, tải lại từ đầu.
    await rm(part, { force: true });
    offset = 0;
  }
  if (!res.body) throw new AppError('NETWORK', 'phản hồi không có nội dung');

  const out = createWriteStream(part, { flags: offset > 0 ? 'a' : 'w' });
  const started = Date.now();
  let received = offset;
  let windowStart = started;
  let windowBytes = 0;
  let speed = 0;
  const body = Readable.fromWeb(res.body as import('node:stream/web').ReadableStream<Uint8Array>);
  body.on('data', (chunk: Buffer) => {
    received += chunk.length;
    windowBytes += chunk.length;
    const now = Date.now();
    if (now - windowStart >= 500) {
      speed = (windowBytes * 1000) / (now - windowStart);
      windowStart = now;
      windowBytes = 0;
    }
    opts.onProgress?.({ receivedBytes: received, totalBytes: opts.size, bytesPerSecond: speed });
  });
  try {
    await pipeline(body, out);
  } catch (err) {
    out.destroy();
    throw err;
  }
  opts.onProgress?.({ receivedBytes: received, totalBytes: opts.size, bytesPerSecond: speed });
}
