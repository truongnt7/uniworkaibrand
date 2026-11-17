import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, type RuntimeManifest, type RuntimeProgress } from '@aps/shared';
import { RuntimeManager, type RuntimeManagerOptions } from '../src/orchestrator/runtime/manager.js';
import { parseSignedManifest, selectArtifact } from '../src/orchestrator/runtime/manifest.js';
import { extractArchive } from '../src/orchestrator/runtime/extract.js';

const ARCHIVE = Buffer.from('fake-archive-bytes');
const SHA = createHash('sha256').update(ARCHIVE).digest('hex');

function manifest(version = '4.5.16', sha = SHA, size = ARCHIVE.length): RuntimeManifest {
  return {
    schemaVersion: 1,
    blender: {
      version,
      channel: 'LTS',
      artifacts: {
        'linux-x64': { url: 'https://example.test/b.tar.xz', mirrors: [], size, sha256: sha, archive: 'tar.xz', binary: `blender-${version}/blender` },
      },
    },
  };
}

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-rt-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fakeExtract(version = '4.5.16'): RuntimeManagerOptions['extract'] {
  return async (_archive, _type, dest) => {
    mkdirSync(join(dest, `blender-${version}`), { recursive: true });
    writeFileSync(join(dest, `blender-${version}`, 'blender'), `v${version}`);
  };
}

function makeManager(dir: string, over: Partial<RuntimeManagerOptions> = {}, m: RuntimeManifest = manifest()) {
  const progress: RuntimeProgress[] = [];
  const mgr = new RuntimeManager({
    dir,
    workerScript: '/w/worker.py',
    platformKey: 'linux-x64',
    loadManifest: async () => m,
    download: async (o) => {
      writeFileSync(o.dest, ARCHIVE);
    },
    extract: fakeExtract(m.blender.version),
    smoke: async () => {},
    diskCheck: async () => {},
    onProgress: (p) => progress.push(p),
    ...over,
  });
  return { mgr, progress };
}

describe('RuntimeManager', () => {
  it('cài thành công: tải -> giải nén -> smoke -> kích hoạt, rồi dọn file tải', async () => {
    const dir = tmp();
    const { mgr, progress } = makeManager(dir);
    expect((await mgr.status()).installed).toBe(false);
    const st = await mgr.install();
    expect(st).toMatchObject({ installed: true, version: '4.5.16' });
    expect(readFileSync(st.binaryPath as string, 'utf8')).toBe('v4.5.16');
    expect(progress.map((p) => p.phase)).toEqual(['extracting', 'smoke-test', 'activating', 'done']);
    expect(readdirSync(dir).filter((n) => n.startsWith('tmp-'))).toEqual([]);
    expect(existsSync(join(dir, 'downloads', 'blender-4.5.16-linux-x64.tar.xz'))).toBe(false);
  });

  it('(d) smoke test lỗi -> không kích hoạt, giữ nguyên bản cũ, dọn thư mục tạm', async () => {
    const dir = tmp();
    await makeManager(dir, {}, manifest('4.5.15')).mgr.install();
    const { mgr } = makeManager(dir, {
      smoke: async () => {
        throw new AppError('SMOKE_TEST_FAILED', 'blender không chạy');
      },
    });
    await expect(mgr.install()).rejects.toMatchObject({ code: 'SMOKE_TEST_FAILED' });
    const st = await mgr.status();
    expect(st).toMatchObject({ installed: true, version: '4.5.15' });
    expect(readdirSync(dir).filter((n) => n.startsWith('tmp-'))).toEqual([]);
  });

  it('nâng cấp thành công thay bản cũ nguyên tử và xóa thư mục cũ', async () => {
    const dir = tmp();
    await makeManager(dir, {}, manifest('4.5.15')).mgr.install();
    const st = await makeManager(dir, {}, manifest('4.5.16')).mgr.install();
    expect(st.version).toBe('4.5.16');
    expect(readdirSync(dir).filter((n) => n.includes('.old-'))).toEqual([]);
  });

  it('(c) hết dung lượng đĩa -> DISK_SPACE, bản cũ không bị đụng tới', async () => {
    const dir = tmp();
    await makeManager(dir, {}, manifest('4.5.15')).mgr.install();
    let downloaded = false;
    const { mgr } = makeManager(dir, {
      diskCheck: async () => {
        throw new AppError('DISK_SPACE', 'không đủ chỗ');
      },
      download: async () => {
        downloaded = true;
      },
    });
    await expect(mgr.install()).rejects.toMatchObject({ code: 'DISK_SPACE' });
    expect(downloaded).toBe(false);
    expect((await mgr.status()).version).toBe('4.5.15');
  });

  it('lỗi tải (checksum) lan ra UI dưới dạng phase=error + mã', async () => {
    const dir = tmp();
    const { mgr, progress } = makeManager(dir, {
      download: async () => {
        throw new AppError('CHECKSUM_MISMATCH', 'sai sha');
      },
    });
    await expect(mgr.install()).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    expect(progress.at(-1)).toMatchObject({ phase: 'error', errorCode: 'CHECKSUM_MISMATCH' });
    expect((await mgr.status()).installed).toBe(false);
  });

  it('thiếu binary sau giải nén -> EXTRACT_FAILED', async () => {
    const { mgr } = makeManager(tmp(), { extract: async (_a, _t, dest) => void mkdirSync(dest, { recursive: true }) });
    await expect(mgr.install()).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
  });

  it('chỉ một lần cài tại một thời điểm (single-flight)', async () => {
    let calls = 0;
    const { mgr } = makeManager(tmp(), {
      download: async (o) => {
        calls++;
        await new Promise((r) => setTimeout(r, 20));
        writeFileSync(o.dest, ARCHIVE);
      },
    });
    const [a, b] = await Promise.all([mgr.install(), mgr.install()]);
    expect(calls).toBe(1);
    expect(a.installed && b.installed).toBe(true);
  });

  it('nền tảng không có trong manifest -> PLATFORM_UNSUPPORTED', async () => {
    const { mgr } = makeManager(tmp(), { platformKey: 'darwin-arm64' });
    await expect(mgr.install()).rejects.toMatchObject({ code: 'PLATFORM_UNSUPPORTED' });
  });

  it('nhập runtime từ file offline: chấp nhận khi khớp sha256, từ chối khi sai', async () => {
    const dir = tmp();
    const good = join(dir, 'offline.tar.xz');
    writeFileSync(good, ARCHIVE);
    const { mgr } = makeManager(dir);
    expect((await mgr.importFromFile(good)).installed).toBe(true);
    expect(existsSync(good)).toBe(true);

    const bad = join(dir, 'bad.tar.xz');
    writeFileSync(bad, Buffer.from('fake-archive-BYTES'));
    const dir2 = tmp();
    await expect(makeManager(dir2).mgr.importFromFile(bad)).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    writeFileSync(bad, 'short');
    await expect(makeManager(dir2).mgr.importFromFile(bad)).rejects.toMatchObject({ code: 'SIZE_MISMATCH' });
  });

  it('binaryOverride bỏ qua tải (dùng cho dev)', async () => {
    const { mgr } = makeManager(tmp(), { binaryOverride: '/usr/bin/blender' });
    expect(await mgr.getBinaryPath()).toBe('/usr/bin/blender');
  });

  it('getBinaryPath ném RUNTIME_MISSING khi chưa cài', async () => {
    await expect(makeManager(tmp()).mgr.getBinaryPath()).rejects.toMatchObject({ code: 'RUNTIME_MISSING' });
  });
});

describe('manifest ký', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const text = JSON.stringify(manifest());
  const signature = sign(null, Buffer.from(text), privateKey).toString('base64');

  it('chấp nhận chữ ký đúng', () => {
    const m = parseSignedManifest({ manifest: text, signature }, pem);
    expect(m.blender.version).toBe('4.5.16');
    expect(selectArtifact(m, 'linux-x64').sha256).toBe(SHA);
  });

  it('từ chối manifest bị sửa sau khi ký', () => {
    const tampered = text.replace(SHA, 'f'.repeat(64));
    expect(() => parseSignedManifest({ manifest: tampered, signature }, pem)).toThrowError(/chữ ký/);
  });

  it('từ chối chữ ký của khóa khác và thiếu khóa công khai', () => {
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(() => parseSignedManifest({ manifest: text, signature }, other)).toThrow();
    expect(() => parseSignedManifest({ manifest: text, signature }, null)).toThrow();
  });

  it('từ chối manifest hợp lệ chữ ký nhưng sai schema (Blender 5.x)', () => {
    const bad = JSON.stringify(manifest('5.0.1'));
    const sig = sign(null, Buffer.from(bad), privateKey).toString('base64');
    expect(() => parseSignedManifest({ manifest: bad, signature: sig }, pem)).toThrow(AppError);
  });
});

describe.skipIf(process.platform !== 'linux')('extractArchive tar.xz (Linux)', () => {
  it('giải nén thật bằng tar', async () => {
    const dir = tmp();
    mkdirSync(join(dir, 'src', 'blender-x'), { recursive: true });
    writeFileSync(join(dir, 'src', 'blender-x', 'blender'), 'hello');
    const archive = join(dir, 'a.tar.xz');
    expect(spawnSync('tar', ['-cJf', archive, '-C', join(dir, 'src'), '.']).status).toBe(0);
    await extractArchive(archive, 'tar.xz', join(dir, 'out'));
    expect(readFileSync(join(dir, 'out', 'blender-x', 'blender'), 'utf8')).toBe('hello');
  });

  it('file hỏng -> EXTRACT_FAILED', async () => {
    const dir = tmp();
    const archive = join(dir, 'bad.tar.xz');
    writeFileSync(archive, 'not an archive');
    await expect(extractArchive(archive, 'tar.xz', join(dir, 'out'))).rejects.toMatchObject({ code: 'EXTRACT_FAILED' });
  });
});
