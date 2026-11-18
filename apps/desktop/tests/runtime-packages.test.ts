import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, RuntimeManifest, runtimePackageComponents, type RuntimeManifest as Manifest, type RuntimeProgress } from '@aps/shared';
import { RuntimeManager, type RuntimeManagerOptions } from '../src/orchestrator/runtime/manager.js';
import { parseSignedManifest } from '../src/orchestrator/runtime/manifest.js';
import { makeKey } from './helpers-trust.js';

const BLENDER = Buffer.from('blender-archive-bytes');
const FFMPEG = Buffer.from('ffmpeg-archive-bytes-longer');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

function manifest(withPackages = true): Manifest {
  return {
    schemaVersion: 1,
    blender: {
      version: '4.5.16',
      channel: 'LTS',
      artifacts: { 'linux-x64': { url: 'https://example.test/blender-4.5.16-linux-x64.tar.xz', mirrors: [], size: BLENDER.length, sha256: sha(BLENDER), archive: 'tar.xz', binary: 'blender-4.5.16/blender' } },
    },
    ffmpeg: {
      version: 'n8.1.3',
      license: 'LGPL-3.0-or-later',
      sourceUrl: 'https://example.test/src',
      artifacts: { 'linux-x64': { url: 'https://example.test/ffmpeg-n8.1.3-linux64-lgpl.tar.xz', mirrors: [], size: FFMPEG.length, sha256: sha(FFMPEG), archive: 'tar.xz', binary: 'ffmpeg-n8.1.3/bin/ffmpeg' } },
    },
    ...(withPackages
      ? { packages: { ffmpeg: { components: ['ffmpeg' as const], requires: [] }, blender: { components: ['blender' as const], requires: ['ffmpeg' as const] } } }
      : {}),
  };
}

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-rtpkg-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const fakeExtract: RuntimeManagerOptions['extract'] = async (archive, _t, dest) => {
  const isFf = archive.includes('ffmpeg');
  const bin = isFf ? join(dest, 'ffmpeg-n8.1.3', 'bin', 'ffmpeg') : join(dest, 'blender-4.5.16', 'blender');
  mkdirSync(join(bin, '..'), { recursive: true });
  writeFileSync(bin, isFf ? 'ff' : 'bl');
};

function setup(dir: string, over: Partial<RuntimeManagerOptions> = {}, m: Manifest = manifest()) {
  const progress: RuntimeProgress[] = [];
  const downloads: string[] = [];
  const smoke: string[] = [];
  const ffchecks: string[] = [];
  const mgr = new RuntimeManager({
    dir,
    workerScript: '/w/worker.py',
    platformKey: 'linux-x64',
    loadManifest: async () => m,
    download: async (o) => {
      downloads.push(o.dest.includes('ffmpeg') ? 'ffmpeg' : 'blender');
      writeFileSync(o.dest, o.dest.includes('ffmpeg') ? FFMPEG : BLENDER);
    },
    extract: fakeExtract,
    smoke: async (o) => void smoke.push(o.binary),
    ffmpegCheck: async (b) => void ffchecks.push(b),
    diskCheck: async () => {},
    onProgress: (p) => progress.push(p),
    ...over,
  });
  return { mgr, progress, downloads, smoke, ffchecks };
}

describe('gói runtime tách riêng trong manifest', () => {
  it('schema: có/không có mục packages đều hợp lệ; gói sai ràng buộc bị từ chối', () => {
    expect(RuntimeManifest.safeParse(manifest(false)).success).toBe(true);
    expect(RuntimeManifest.safeParse(manifest(true)).success).toBe(true);
    const bad = manifest();
    bad.packages = { ffmpeg: { components: ['ffmpeg'], requires: ['blender'] } };
    expect(RuntimeManifest.safeParse(bad).success).toBe(false);
    const bad2 = manifest();
    bad2.packages = { ffmpeg: { components: ['blender'], requires: [] } };
    expect(RuntimeManifest.safeParse(bad2).success).toBe(false);
    const bad3 = manifest();
    bad3.packages = { blender: { components: ['ffmpeg'], requires: [] } };
    expect(RuntimeManifest.safeParse(bad3).success).toBe(false);
  });

  it('runtimePackageComponents: gói yêu cầu đứng trước; manifest cũ dùng mặc định', () => {
    expect(runtimePackageComponents(manifest(true), 'ffmpeg')).toEqual(['ffmpeg']);
    expect(runtimePackageComponents(manifest(true), 'blender')).toEqual(['ffmpeg', 'blender']);
    expect(runtimePackageComponents(manifest(false), 'blender')).toEqual(['ffmpeg', 'blender']);
  });

  it('sửa mục packages sau khi ký -> chữ ký không hợp lệ', () => {
    const prod = makeKey('prod-2026');
    const text = JSON.stringify(manifest());
    const env = prod.signText(text);
    expect(parseSignedManifest(env, { keys: [prod.trusted] }).packages?.blender?.requires).toEqual(['ffmpeg']);
    const tampered = text.replace('"requires":["ffmpeg"]', '"requires":[]');
    expect(tampered).not.toBe(text);
    expect(() => parseSignedManifest({ ...env, manifest: tampered }, { keys: [prod.trusted] })).toThrowError(expect.objectContaining({ code: 'MANIFEST_SIGNATURE_INVALID' }));
  });

  it('chỉ cài gói ffmpeg: không tải, không giải nén, không chạy thử Blender', async () => {
    const dir = tmp();
    const { mgr, downloads, smoke, ffchecks, progress } = setup(dir);
    const st = await mgr.install(['ffmpeg']);
    expect(downloads).toEqual(['ffmpeg']);
    expect(smoke).toEqual([]);
    expect(ffchecks).toHaveLength(1);
    expect(st.installed).toBe(false);
    expect(st.binaryPath).toBeNull();
    expect(st.ffmpegPath).toBeTruthy();
    expect(st.packages).toEqual({ ffmpeg: { installed: true, version: 'n8.1.3' }, blender: { installed: false, version: null } });
    expect(readFileSync(st.ffmpegPath!, 'utf8')).toBe('ff');
    expect(progress.at(-1)).toMatchObject({ phase: 'done' });
    expect(progress.every((p) => p.component === 'ffmpeg')).toBe(true);
    await expect(mgr.getBinaryPath()).rejects.toMatchObject({ code: 'RUNTIME_MISSING' });
  });

  it('cài gói blender: tự kèm gói ffmpeg trước, báo bước 1/2 rồi 2/2', async () => {
    const { mgr, downloads, progress } = setup(tmp());
    const st = await mgr.install(['blender']);
    expect(downloads).toEqual(['ffmpeg', 'blender']);
    expect(st.packages?.blender.installed && st.packages.ffmpeg.installed).toBe(true);
    const steps = progress.filter((p) => p.phase === 'extracting').map((p) => [p.component, p.step, p.steps]);
    expect(steps).toEqual([
      ['ffmpeg', 1, 2],
      ['blender', 2, 2],
    ]);
    expect(progress.filter((p) => p.phase === 'done')).toHaveLength(1);
  });

  it('gói đã cài đúng phiên bản và sha256 thì bỏ qua, không tải lại', async () => {
    const dir = tmp();
    await setup(dir).mgr.install(['ffmpeg']);
    const { mgr, downloads } = setup(dir);
    const st = await mgr.install(['ffmpeg']);
    expect(downloads).toEqual([]);
    expect(st.ffmpegPath).toBeTruthy();
    const second = await mgr.install(['blender']);
    expect(downloads).toEqual(['blender']);
    expect(second.installed).toBe(true);
  });

  it('gói blender lỗi giữa chừng: ffmpeg đã cài vẫn dùng được; thử lại tải đúng phần còn thiếu', async () => {
    const dir = tmp();
    let failBlender = true;
    const first = setup(dir, {
      download: async (o) => {
        if (o.dest.includes('blender') && failBlender) throw new AppError('NETWORK', 'mất mạng');
        writeFileSync(o.dest, o.dest.includes('ffmpeg') ? FFMPEG : BLENDER);
      },
    });
    await expect(first.mgr.install(['blender'])).rejects.toMatchObject({ code: 'NETWORK' });
    const mid = await first.mgr.status();
    expect(mid.packages).toEqual({ ffmpeg: { installed: true, version: 'n8.1.3' }, blender: { installed: false, version: null } });
    expect(mid.installed).toBe(false);
    expect(first.progress.at(-1)).toMatchObject({ phase: 'error', errorCode: 'NETWORK' });

    failBlender = false;
    const retry = setup(dir);
    const st = await retry.mgr.install(['blender']);
    expect(retry.downloads).toEqual(['blender']);
    expect(st.installed).toBe(true);
  });

  it('archive đã tải xong và đã xác minh ở lần trước được dùng lại (không tải lại từ đầu)', async () => {
    const dir = tmp();
    mkdirSync(join(dir, 'downloads'), { recursive: true });
    writeFileSync(join(dir, 'downloads', 'ffmpeg-n8.1.3-linux-x64.tar.xz'), FFMPEG);
    const { mgr, downloads } = setup(dir);
    expect((await mgr.install(['ffmpeg'])).ffmpegPath).toBeTruthy();
    expect(downloads).toEqual([]);
    expect(existsSync(join(dir, 'downloads', 'ffmpeg-n8.1.3-linux-x64.tar.xz'))).toBe(false);
  });

  it('không có tham số = tất cả gói (tương thích cách gọi cũ)', async () => {
    const { mgr, downloads } = setup(tmp());
    const st = await mgr.install();
    expect(downloads.sort()).toEqual(['blender', 'ffmpeg']);
    expect(st.installed && st.ffmpegPath).toBeTruthy();
  });

  it('hai yêu cầu khác gói khi đang cài được xếp nối tiếp, không chạy chồng', async () => {
    const downloads: string[] = [];
    const { mgr } = setup(tmp(), {
      download: async (o) => {
        const kind = o.dest.includes('ffmpeg') ? 'ffmpeg' : 'blender';
        downloads.push(`${kind}:start`);
        await new Promise((r) => setTimeout(r, 15));
        writeFileSync(o.dest, kind === 'ffmpeg' ? FFMPEG : BLENDER);
        downloads.push(`${kind}:end`);
      },
    });
    const a = mgr.install(['ffmpeg']);
    const b = mgr.install(['blender']);
    await Promise.all([a, b]);
    expect(downloads).toEqual(['ffmpeg:start', 'ffmpeg:end', 'blender:start', 'blender:end']);
    expect((await mgr.status()).installed).toBe(true);
  });

  it('tải thật qua HTTP: đứt giữa chừng thì thử lại và tiếp tục bằng Range, rồi kiểm sha256', async () => {
    const dir = tmp();
    const ranges: (string | null)[] = [];
    let call = 0;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      const range = (init?.headers as Record<string, string> | undefined)?.Range ?? null;
      ranges.push(range);
      call++;
      const start = range ? Number(/bytes=(\d+)-/.exec(range)![1]) : 0;
      const body = FFMPEG.subarray(start);
      if (call === 1) {
        const half = body.subarray(0, 6);
        let sent = false;
        const stream = new ReadableStream({
          async pull(c) {
            if (!sent) {
              sent = true;
              c.enqueue(new Uint8Array(half));
              await new Promise((r) => setTimeout(r, 30));
              return;
            }
            c.error(new Error('ECONNRESET'));
          },
        });
        return new Response(stream, { status: 200 });
      }
      return new Response(new Uint8Array(body), { status: start > 0 ? 206 : 200 });
    }) as unknown as typeof fetch;
    const { mgr, progress } = setup(dir, { download: undefined, fetchImpl, backoffMs: () => 0, sleep: async () => {}, maxAttempts: 3 });
    const st = await mgr.install(['ffmpeg']);
    expect(st.ffmpegPath).toBeTruthy();
    expect(ranges[0]).toBeNull();
    expect(ranges[1]).toBe('bytes=6-');
    const retrying = progress.find((p) => p.phase === 'retrying');
    expect(retrying).toMatchObject({ component: 'ffmpeg', attempt: 2, maxAttempts: 3 });
    expect(progress.some((p) => p.phase === 'downloading' && p.totalBytes === FFMPEG.length)).toBe(true);
  });

  it('sai checksum khi tải: không kích hoạt, báo CHECKSUM_MISMATCH, không để lại tệp tạm', async () => {
    const dir = tmp();
    const fetchImpl = (async () => new Response(new Uint8Array(Buffer.alloc(FFMPEG.length, 1)), { status: 200 })) as unknown as typeof fetch;
    const { mgr } = setup(dir, { download: undefined, fetchImpl, backoffMs: () => 0, sleep: async () => {}, maxAttempts: 2 });
    await expect(mgr.install(['ffmpeg'])).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    expect(existsSync(join(dir, 'active.json'))).toBe(false);
    expect(readdirSync(join(dir, 'downloads'))).toEqual([]);
  });

  it('nhập một tệp ffmpeg đơn lẻ khớp sha256 trong manifest: chỉ cài gói ffmpeg', async () => {
    const dir = tmp();
    const file = join(dir, 'ffmpeg-offline.tar.xz');
    writeFileSync(file, FFMPEG);
    const { mgr, smoke } = setup(dir);
    const st = await mgr.importFromFile(file);
    expect(st.ffmpegPath).toBeTruthy();
    expect(st.installed).toBe(false);
    expect(smoke).toEqual([]);
    const bad = join(dir, 'bad.tar.xz');
    writeFileSync(bad, Buffer.alloc(FFMPEG.length, 7));
    await expect(setup(tmp()).mgr.importFromFile(bad)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
  });
});

const posix = process.platform !== 'win32';
const prod = makeKey('trial-test');

function buildPack(packages: ('ffmpeg' | 'blender')[] | undefined, files: { ffmpeg?: Buffer; blender?: Buffer }): string {
  const stage = tmp();
  const names: string[] = [];
  if (files.blender) {
    mkdirSync(join(stage, 'blender'));
    writeFileSync(join(stage, 'blender', 'blender-4.5.16-linux-x64.tar.xz'), files.blender);
    names.push('blender');
  }
  if (files.ffmpeg) {
    mkdirSync(join(stage, 'ffmpeg'));
    writeFileSync(join(stage, 'ffmpeg', 'ffmpeg-n8.1.3-linux64-lgpl.tar.xz'), files.ffmpeg);
    names.push('ffmpeg');
  }
  writeFileSync(join(stage, 'pack.json'), JSON.stringify({ format: 1, platform: 'linux-x64', manifest: prod.signText(JSON.stringify(manifest())), ...(packages ? { packages } : {}) }));
  const out = join(tmp(), 'x.apspack');
  expect(spawnSync('tar', ['-cf', out, '-C', stage, 'pack.json', ...names]).status).toBe(0);
  return out;
}

describe.skipIf(!posix)('gói offline .apspack theo gói', () => {
  const packMgr = (dir: string) =>
    setup(dir, { parseManifest: (raw) => parseSignedManifest(raw, { keys: [prod.trusted] }), download: async () => void expect.unreachable('không được tải qua mạng') });

  it('gói nhẹ chỉ có ffmpeg: nhập được, không cần Blender', async () => {
    const { mgr, smoke } = packMgr(tmp());
    const st = await mgr.importFromFile(buildPack(['ffmpeg'], { ffmpeg: FFMPEG }));
    expect(st.ffmpegPath).toBeTruthy();
    expect(st.installed).toBe(false);
    expect(smoke).toEqual([]);
    expect(st.packages?.ffmpeg.installed).toBe(true);
  });

  it('gói chỉ có blender: nhập được, ffmpeg vẫn chưa có (banner sẽ yêu cầu gói ffmpeg)', async () => {
    const { mgr } = packMgr(tmp());
    const st = await mgr.importFromFile(buildPack(['blender'], { blender: BLENDER }));
    expect(st.installed).toBe(true);
    expect(st.ffmpegPath).toBeNull();
  });

  it('gói khai ffmpeg nhưng thiếu tệp -> PACK_INVALID; sửa 1 byte -> CHECKSUM_MISMATCH', async () => {
    await expect(packMgr(tmp()).mgr.importFromFile(buildPack(['ffmpeg'], {}))).rejects.toMatchObject({ code: 'PACK_INVALID' });
    const bad = Buffer.from(FFMPEG);
    bad[2] = bad[2]! ^ 1;
    const dir = tmp();
    await expect(packMgr(dir).mgr.importFromFile(buildPack(['ffmpeg'], { ffmpeg: bad }))).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    expect(existsSync(join(dir, 'active.json'))).toBe(false);
  });

  it('gói cũ không có trường packages vẫn là gói đầy đủ cả hai', async () => {
    const { mgr } = packMgr(tmp());
    const st = await mgr.importFromFile(buildPack(undefined, { ffmpeg: FFMPEG, blender: BLENDER }));
    expect(st.installed && st.ffmpegPath).toBeTruthy();
    await expect(packMgr(tmp()).mgr.importFromFile(buildPack(undefined, { blender: BLENDER }))).rejects.toMatchObject({ code: 'PACK_INVALID' });
  });
});
