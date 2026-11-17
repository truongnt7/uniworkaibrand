import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, type RuntimeManifest } from '@aps/shared';
import { RuntimeManager, type RuntimeManagerOptions } from '../src/orchestrator/runtime/manager.js';
import { parseSignedManifest } from '../src/orchestrator/runtime/manifest.js';
import { makeKey } from './helpers-trust.js';

const posix = process.platform !== 'win32';
const BLENDER = Buffer.from('blender-archive-bytes');
const FFMPEG = Buffer.from('ffmpeg-archive-bytes');
const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex');

const manifest = (): RuntimeManifest => ({
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
});

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-pack-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const prod = makeKey('prod-2026');

function buildPack(opts: { signer?: ReturnType<typeof makeKey>; blender?: Buffer; ffmpeg?: Buffer | null; manifestText?: string } = {}): string {
  const stage = tmp();
  mkdirSync(join(stage, 'blender'));
  writeFileSync(join(stage, 'blender', 'blender-4.5.16-linux-x64.tar.xz'), opts.blender ?? BLENDER);
  if (opts.ffmpeg !== null) {
    mkdirSync(join(stage, 'ffmpeg'));
    writeFileSync(join(stage, 'ffmpeg', 'ffmpeg-n8.1.3-linux64-lgpl.tar.xz'), opts.ffmpeg ?? FFMPEG);
  }
  const text = opts.manifestText ?? JSON.stringify(manifest());
  writeFileSync(join(stage, 'pack.json'), JSON.stringify({ format: 1, platform: 'linux-x64', manifest: (opts.signer ?? prod).signText(text) }));
  const out = join(tmp(), 'runtime.apspack');
  const names = readdirSync(stage);
  const r = spawnSync('tar', ['-cf', out, '-C', stage, ...names]);
  expect(r.status).toBe(0);
  return out;
}

const fakeExtract: RuntimeManagerOptions['extract'] = async (archive, _t, dest) => {
  const isFf = archive.includes('ffmpeg');
  const bin = isFf ? join(dest, 'ffmpeg-n8.1.3', 'bin', 'ffmpeg') : join(dest, 'blender-4.5.16', 'blender');
  mkdirSync(join(bin, '..'), { recursive: true });
  writeFileSync(bin, isFf ? 'ff' : 'bl');
};

function mgr(dir: string, over: Partial<RuntimeManagerOptions> = {}) {
  return new RuntimeManager({
    dir,
    workerScript: '/w/worker.py',
    platformKey: 'linux-x64',
    loadManifest: async () => manifest(),
    parseManifest: (raw) => parseSignedManifest(raw, { keys: [prod.trusted] }),
    extract: fakeExtract,
    smoke: async () => {},
    ffmpegCheck: async () => {},
    diskCheck: async () => {},
    ...over,
  });
}

describe.skipIf(!posix)('gói runtime offline (.apspack)', () => {
  it('nhập gói hợp lệ: cài cả Blender và FFmpeg, kích hoạt nguyên tử, không cần mạng', async () => {
    const dir = tmp();
    const m = mgr(dir, { download: async () => void expect.unreachable('không được tải qua mạng') });
    const st = await m.importFromFile(buildPack());
    expect(st).toMatchObject({ installed: true, version: '4.5.16' });
    expect(readFileSync(st.binaryPath!, 'utf8')).toBe('bl');
    expect(readFileSync(st.ffmpegPath!, 'utf8')).toBe('ff');
    expect(readdirSync(dir).filter((n) => n.startsWith('pack-') || n.startsWith('tmp-'))).toEqual([]);
    expect(await m.getFfmpegPath()).toBe(st.ffmpegPath);
  });

  it('sửa 1 byte trong gói -> CHECKSUM_MISMATCH, không kích hoạt gì', async () => {
    const dir = tmp();
    const m = mgr(dir);
    const bad = Buffer.from(BLENDER);
    bad[3] = bad[3]! ^ 1;
    await expect(m.importFromFile(buildPack({ blender: bad }))).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    await expect(m.importFromFile(buildPack({ ffmpeg: Buffer.from('ffmpeg-archive-BYTES') }))).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    expect(existsSync(join(dir, 'active.json'))).toBe(false);
    expect((await m.status()).installed).toBe(false);
  });

  it('gói thiếu FFmpeg dù manifest yêu cầu -> PACK_INVALID', async () => {
    await expect(mgr(tmp()).importFromFile(buildPack({ ffmpeg: null }))).rejects.toMatchObject({ code: 'PACK_INVALID' });
  });

  it('gói ký bằng khóa lạ hoặc khóa dev bị từ chối; manifest bị sửa bị từ chối', async () => {
    const m = mgr(tmp());
    await expect(m.importFromFile(buildPack({ signer: makeKey('prod-other') }))).rejects.toMatchObject({ code: 'MANIFEST_UNTRUSTED_KEY' });
    await expect(m.importFromFile(buildPack({ signer: makeKey('dev-1') }))).rejects.toMatchObject({ code: 'MANIFEST_UNTRUSTED_KEY' });
    const stage = buildPack();
    // gói khác có manifest ký đúng nhưng sau đó bị đổi sha256 -> ghi lại pack.json với chữ ký cũ
    const signed = prod.signText(JSON.stringify(manifest()));
    const tampered = { ...signed, manifest: signed.manifest.replace(sha(BLENDER), 'f'.repeat(64)) };
    const dir = tmp();
    mkdirSync(join(dir, 'blender'));
    writeFileSync(join(dir, 'blender', 'blender-4.5.16-linux-x64.tar.xz'), BLENDER);
    writeFileSync(join(dir, 'pack.json'), JSON.stringify({ format: 1, platform: 'linux-x64', manifest: tampered }));
    const out = join(tmp(), 'x.apspack');
    spawnSync('tar', ['-cf', out, '-C', dir, 'blender', 'pack.json']);
    await expect(m.importFromFile(out)).rejects.toMatchObject({ code: 'MANIFEST_SIGNATURE_INVALID' });
    expect(existsSync(stage)).toBe(true);
  });

  it('file không phải tar/pack.json -> PACK_INVALID', async () => {
    const junk = join(tmp(), 'junk.apspack');
    writeFileSync(junk, 'không phải tar');
    await expect(mgr(tmp()).importFromFile(junk)).rejects.toMatchObject({ code: 'PACK_INVALID' });
  });

  it('FFmpeg không đạt chính sách LGPL -> không kích hoạt, giữ nguyên bản cũ (cả Blender mới)', async () => {
    const dir = tmp();
    await mgr(dir).importFromFile(buildPack());
    const before = readFileSync(join(dir, 'active.json'), 'utf8');
    const m = mgr(dir, {
      ffmpegCheck: async () => {
        throw new AppError('FFMPEG_LICENSE_VIOLATION', 'có --enable-gpl');
      },
    });
    await expect(m.importFromFile(buildPack())).rejects.toMatchObject({ code: 'FFMPEG_LICENSE_VIOLATION' });
    expect(readFileSync(join(dir, 'active.json'), 'utf8')).toBe(before);
    expect(readdirSync(dir).filter((n) => n.startsWith('tmp-'))).toEqual([]);
  });

  it('tải qua mạng cũng cài FFmpeg và chạy cổng kiểm LGPL', async () => {
    const dir = tmp();
    const checked: string[] = [];
    const m = mgr(dir, {
      download: async (o) => writeFileSync(o.dest, o.dest.includes('ffmpeg') ? FFMPEG : BLENDER),
      ffmpegCheck: async (bin) => void checked.push(bin),
    });
    const st = await m.install();
    expect(st.ffmpegPath).toBeTruthy();
    expect(checked).toHaveLength(1);
  });
});
