import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AppError } from '@aps/shared';
import { downloadVerified, ensureDiskSpace, defaultBackoff, type DownloadOptions } from '../src/orchestrator/runtime/download.js';

const payload = randomBytes(600_000);
const sha = createHash('sha256').update(payload).digest('hex');

interface Behavior {
  /** Cắt kết nối sau N byte ở N lần phản hồi đầu. */
  dropAfter?: { bytes: number; times: number };
  /** Lật 1 byte ở N lần phản hồi đầu (đĩa/mạng làm hỏng dữ liệu). */
  corrupt?: number;
  failStatus?: { status: number; times: number };
  ignoreRange?: boolean;
  statusFor?: (path: string) => number | null;
}

let server: Server;
let base = '';
let behavior: Behavior = {};
const seen: { path: string; range: string | undefined }[] = [];
let served = 0;

function handler(req: IncomingMessage, res: ServerResponse) {
  const path = req.url ?? '/';
  seen.push({ path, range: req.headers.range });
  const forced = behavior.statusFor?.(path);
  if (forced) {
    res.writeHead(forced).end();
    return;
  }
  if (behavior.failStatus && behavior.failStatus.times > 0) {
    behavior.failStatus.times--;
    res.writeHead(behavior.failStatus.status).end();
    return;
  }
  const idx = served++;
  let start = 0;
  const m = !behavior.ignoreRange && /^bytes=(\d+)-$/.exec(req.headers.range ?? '');
  if (m) start = Number(m[1]);
  let body = payload.subarray(start);
  if (behavior.corrupt && idx < behavior.corrupt) {
    body = Buffer.from(body);
    body[10] = (body[10] ?? 0) ^ 0xff;
  }
  if (start > 0) {
    res.writeHead(206, { 'Content-Length': body.length, 'Content-Range': `bytes ${start}-${payload.length - 1}/${payload.length}` });
  } else {
    res.writeHead(200, { 'Content-Length': body.length });
  }
  if (behavior.dropAfter && idx < behavior.dropAfter.times) {
    res.write(body.subarray(0, behavior.dropAfter.bytes), () => req.socket.destroy());
    return;
  }
  res.end(body);
}

beforeAll(async () => {
  server = createServer(handler);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const dirs: string[] = [];
afterEach(() => {
  behavior = {};
  seen.length = 0;
  served = 0;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function opts(over: Partial<DownloadOptions> = {}): DownloadOptions & { waits: number[] } {
  const dir = mkdtempSync(join(tmpdir(), 'aps-dl-'));
  dirs.push(dir);
  const waits: number[] = [];
  return {
    urls: [`${base}/blender.tar.xz`],
    dest: join(dir, 'blender.tar.xz'),
    sha256: sha,
    size: payload.length,
    sleep: async (ms) => void waits.push(ms),
    waits,
    ...over,
  };
}

describe('downloadVerified', () => {
  it('tải đủ, báo tiến trình, chỉ để lại file đã xác minh', async () => {
    const o = opts();
    const progress: number[] = [];
    await downloadVerified({ ...o, onProgress: (p) => progress.push(p.receivedBytes) });
    expect(readFileSync(o.dest).equals(payload)).toBe(true);
    expect(existsSync(`${o.dest}.part`)).toBe(false);
    expect(progress.at(-1)).toBe(payload.length);
  });

  it('(a) ngắt kết nối giữa chừng -> tự tiếp tục bằng HTTP Range, không tải lại từ đầu', async () => {
    behavior = { dropAfter: { bytes: 200_000, times: 2 } };
    const o = opts();
    const retries: number[] = [];
    await downloadVerified({ ...o, onRetry: (r) => retries.push(r.attempt) });
    expect(readFileSync(o.dest).equals(payload)).toBe(true);
    expect(retries).toEqual([2, 3]);
    const ranges = seen.map((s) => s.range);
    expect(ranges[0]).toBeUndefined();
    expect(ranges[1]).toMatch(/^bytes=\d{5,}-$/);
    expect(Number(/(\d+)/.exec(ranges[2] ?? '')?.[1])).toBeGreaterThan(Number(/(\d+)/.exec(ranges[1] ?? '')?.[1]));
    expect(o.waits).toEqual([defaultBackoff(1), defaultBackoff(2)]);
  });

  it('(b) sửa 1 byte -> bị từ chối, xóa file hỏng và tải lại sạch', async () => {
    behavior = { corrupt: 1 };
    const o = opts();
    const codes: string[] = [];
    await downloadVerified({ ...o, onRetry: (r) => codes.push(r.error.code) });
    expect(codes).toEqual(['CHECKSUM_MISMATCH']);
    expect(readFileSync(o.dest).equals(payload)).toBe(true);
    expect(seen[1]?.range).toBeUndefined();
  });

  it('(b) hỏng liên tục -> báo CHECKSUM_MISMATCH sau N lần, không để lại file', async () => {
    behavior = { corrupt: 99 };
    const o = opts({ maxAttempts: 3 });
    await expect(downloadVerified(o)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    expect(existsSync(o.dest)).toBe(false);
    expect(existsSync(`${o.dest}.part`)).toBe(false);
    expect(seen).toHaveLength(3);
  });

  it('máy chủ không hỗ trợ Range (trả 200) vẫn ra file đúng', async () => {
    behavior = { dropAfter: { bytes: 100_000, times: 1 }, ignoreRange: true };
    const o = opts();
    await downloadVerified(o);
    expect(readFileSync(o.dest).equals(payload)).toBe(true);
  });

  it('thử lại khi HTTP 503 rồi thành công', async () => {
    behavior = { failStatus: { status: 503, times: 2 } };
    const o = opts();
    await downloadVerified(o);
    expect(statSync(o.dest).size).toBe(payload.length);
    expect(seen).toHaveLength(3);
  });

  it('xoay vòng sang mirror khi URL chính lỗi 404', async () => {
    behavior = { statusFor: (p) => (p.startsWith('/primary') ? 404 : null) };
    const o = opts({ urls: [`${base}/primary/b.tar.xz`, `${base}/mirror/b.tar.xz`] });
    await downloadVerified(o);
    expect(seen.map((s) => s.path)).toEqual(['/primary/b.tar.xz', '/mirror/b.tar.xz']);
  });

  it('lỗi mạng kéo dài -> NETWORK/HTTP_STATUS sau N lần', async () => {
    behavior = { failStatus: { status: 500, times: 99 } };
    const o = opts({ maxAttempts: 2 });
    await expect(downloadVerified(o)).rejects.toMatchObject({ code: 'HTTP_STATUS' });
    expect(seen).toHaveLength(2);
  });

  it('tiếp tục từ file .part có sẵn (ví dụ sau khi app khởi động lại)', async () => {
    const o = opts();
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync(join(o.dest, '..'), { recursive: true });
    writeFileSync(`${o.dest}.part`, payload.subarray(0, 123_456));
    await downloadVerified(o);
    expect(readFileSync(o.dest).equals(payload)).toBe(true);
    expect(seen[0]?.range).toBe('bytes=123456-');
  });

  it('huỷ giữa chừng -> CANCELED và giữ .part để tiếp tục sau', async () => {
    const o = opts();
    const ac = new AbortController();
    const p = downloadVerified({ ...o, signal: ac.signal, onProgress: () => ac.abort() });
    await expect(p).rejects.toMatchObject({ code: 'CANCELED' });
    expect(existsSync(o.dest)).toBe(false);
  });
});

describe('ensureDiskSpace', () => {
  it('(c) không đủ chỗ trống -> DISK_SPACE kèm số liệu', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aps-disk-'));
    dirs.push(dir);
    const fake = async () => ({ bavail: 10n, bsize: 4096n });
    await expect(ensureDiskSpace(dir, 1_000_000, fake)).rejects.toMatchObject({ code: 'DISK_SPACE', details: { neededBytes: 1_000_000, freeBytes: 40960 } });
    await expect(ensureDiskSpace(dir, 1000, fake)).resolves.toBeUndefined();
  });

  it('lỗi ENOSPC khi ghi được phân loại là DISK_SPACE (không thử lại)', async () => {
    const o = opts();
    const enospc = Object.assign(new Error('write ENOSPC'), { code: 'ENOSPC' });
    const failingFetch: typeof fetch = async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: enospc });
    };
    await expect(downloadVerified({ ...o, fetchImpl: failingFetch })).rejects.toBeInstanceOf(AppError);
    await expect(downloadVerified({ ...o, fetchImpl: failingFetch })).rejects.toMatchObject({ code: 'DISK_SPACE' });
  });
});
