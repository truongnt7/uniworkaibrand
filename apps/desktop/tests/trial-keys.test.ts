import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSignedManifest } from '../src/orchestrator/runtime/manifest.js';
import { loadTrustedKeys } from '../src/orchestrator/runtime/trust.js';
import { makeKey } from './helpers-trust.js';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const prepare = join(repo, 'tools', 'trial', 'prepare-trial-keys.mjs');
const checkRelease = resolve(import.meta.dirname, '..', 'scripts', 'check-release.mjs');
const manifestSrc = join(repo, 'tools', 'runtime', 'manifest.json');
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-trial-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const emptyProd = () => {
  const d = tmp();
  mkdirSync(join(d, 'keys'));
  return { keys: join(d, 'keys'), manifest: join(d, 'runtime-manifest.signed.json') };
};
function runPrepare(out: string, extra: string[] = [], env: Record<string, string> = {}) {
  const prod = emptyProd();
  return spawnSync(process.execPath, [prepare, '--out', out, '--prod-keys', prod.keys, '--prod-manifest', prod.manifest, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: '', ...env },
  });
}
const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
const read = (out: string) => {
  const keysDir = join(out, 'keys', 'production');
  const manifestPath = join(out, 'runtime-manifest.signed.json');
  const pubs = readdirSync(keysDir);
  return { keysDir, manifestPath, pubs, envelope: JSON.parse(readFileSync(manifestPath, 'utf8')) as { manifest: string; signature: string; keyId: string } };
};

describe('khóa cho bản cài thử (tools/trial/prepare-trial-keys.mjs)', () => {
  it('chưa có khóa production -> sinh khóa trial riêng: keyId trial-*, không phải dev-*, chỉ có khóa CÔNG KHAI, khóa riêng đã bị xóa', () => {
    const out = join(tmp(), 'staging');
    const r = runPrepare(out);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/TRIAL \(keyId trial-/);
    const { pubs, envelope } = read(out);
    expect(pubs).toHaveLength(1);
    expect(envelope.keyId).toMatch(/^trial-\d{8}-[0-9a-f]{6}$/);
    expect(envelope.keyId.startsWith('dev')).toBe(false);
    expect(pubs[0]).toBe(`${envelope.keyId}.pub.pem`);
    for (const f of files(out)) {
      const text = readFileSync(f, 'latin1');
      expect(text, f).not.toMatch(/PRIVATE KEY/);
      expect(f, f).not.toMatch(/\.key\.pem$/);
    }
    expect(JSON.parse(readFileSync(join(out, 'info.json'), 'utf8'))).toMatchObject({ keyMode: 'trial', ephemeral: true });
  });

  it('app bản phát hành (release=true) tin đúng khóa trial này và xác minh được manifest đã ký; manifest có gói ffmpeg/blender', async () => {
    const out = join(tmp(), 'staging');
    expect(runPrepare(out).status).toBe(0);
    const { keysDir, envelope } = read(out);
    const keys = await loadTrustedKeys({ productionKeysDir: keysDir, release: true, env: { APS_DEV_TRUST_KEY_FILE: '/khong/dung' } });
    expect(keys.map((k) => [k.keyId, k.origin])).toEqual([[envelope.keyId, 'production']]);
    const manifest = parseSignedManifest(envelope, { keys });
    expect(manifest.ffmpeg?.license).toBe('LGPL-3.0-or-later');
    expect(manifest.packages?.ffmpeg?.components).toEqual(['ffmpeg']);
    expect(manifest.packages?.blender?.requires).toEqual(['ffmpeg']);
    expect(JSON.parse(envelope.manifest)).toEqual(JSON.parse(readFileSync(manifestSrc, 'utf8')));
  });

  it('manifest bị sửa sau khi ký, hoặc ký bằng khóa khác (kể cả khóa trial của lần build khác) đều bị từ chối', async () => {
    const a = join(tmp(), 'a');
    const b = join(tmp(), 'b');
    expect(runPrepare(a).status).toBe(0);
    expect(runPrepare(b).status).toBe(0);
    const A = read(a);
    const B = read(b);
    expect(A.envelope.keyId).not.toBe(B.envelope.keyId);
    const keysA = await loadTrustedKeys({ productionKeysDir: A.keysDir, release: true });
    expect(() => parseSignedManifest(B.envelope, { keys: keysA })).toThrowError(/không được tin cậy/);
    const tampered = { ...A.envelope, manifest: A.envelope.manifest.replace('"4.5.16"', '"9.9.9"') };
    expect(() => parseSignedManifest(tampered, { keys: keysA })).toThrowError(/chữ ký manifest không hợp lệ/);
    const forged = makeKey(A.envelope.keyId).signText(A.envelope.manifest);
    expect(() => parseSignedManifest(forged, { keys: keysA })).toThrowError(/chữ ký manifest không hợp lệ/);
  });

  it('bản trial qua cổng check-release --pre; khóa dev-* thì không', () => {
    const out = join(tmp(), 'staging');
    expect(runPrepare(out).status).toBe(0);
    const { keysDir, manifestPath } = read(out);
    const ok = spawnSync(process.execPath, [checkRelease, '--pre', keysDir, manifestPath], { encoding: 'utf8' });
    expect(ok.status, ok.stderr).toBe(0);
    const dev = emptyProd();
    const k = makeKey('dev-1');
    writeFileSync(join(dev.keys, 'dev-1.pub.pem'), k.trusted.publicKeyPem);
    writeFileSync(dev.manifest, JSON.stringify(k.signText(JSON.stringify(JSON.parse(readFileSync(manifestSrc, 'utf8'))))));
    const bad = spawnSync(process.execPath, [checkRelease, '--pre', dev.keys, dev.manifest], { encoding: 'utf8' });
    expect(bad.status).toBe(1);
    expect(bad.stderr).toMatch(/dev/);
  });

  it('--mode production thất bại khi chưa có khóa production (không tự lùi về trial)', () => {
    const r = runPrepare(join(tmp(), 'staging'), ['--mode', 'production']);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/không dùng được khóa production/);
  });

  it('đã có khóa + manifest production hợp lệ -> dùng đúng chúng (chế độ production), không sinh khóa trial', () => {
    const prod = emptyProd();
    const k = makeKey('prod-2026');
    writeFileSync(join(prod.keys, 'prod-2026.pub.pem'), k.trusted.publicKeyPem);
    writeFileSync(prod.manifest, JSON.stringify(k.signText(JSON.stringify(JSON.parse(readFileSync(manifestSrc, 'utf8'))))));
    const out = join(tmp(), 'staging');
    const r = spawnSync(process.execPath, [prepare, '--out', out, '--prod-keys', prod.keys, '--prod-manifest', prod.manifest], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/PRODUCTION \(keyId prod-2026\)/);
    expect(read(out).pubs).toEqual(['prod-2026.pub.pem']);
    expect(JSON.parse(readFileSync(join(out, 'info.json'), 'utf8'))).toMatchObject({ keyMode: 'production', ephemeral: false });
  });

  it('manifest production ký sai khóa -> không dùng, lùi về trial ở chế độ auto nhưng lỗi ở chế độ production', () => {
    const prod = emptyProd();
    const k = makeKey('prod-2026');
    writeFileSync(join(prod.keys, 'prod-2026.pub.pem'), k.trusted.publicKeyPem);
    writeFileSync(prod.manifest, JSON.stringify(makeKey('prod-2026').signText('{"x":1}')));
    const args = ['--prod-keys', prod.keys, '--prod-manifest', prod.manifest];
    const auto = spawnSync(process.execPath, [prepare, '--out', join(tmp(), 's1'), ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
    expect(auto.stdout).toMatch(/TRIAL/);
    const strict = spawnSync(process.execPath, [prepare, '--out', join(tmp(), 's2'), '--mode', 'production', ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
    expect(strict.status).toBe(1);
    expect(strict.stderr).toMatch(/KHÔNG khớp/);
  });

  it('APS_TRIAL_SIGNING_KEY_FILE: khóa trial cố định ngoài repo cho keyId ổn định; khóa nằm trong repo bị từ chối', () => {
    const dir = tmp();
    const { privateKey } = generateKeyPairSync('ed25519');
    const keyFile = join(dir, 'fixed.key.pem');
    writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    const o1 = join(tmp(), 'o1');
    const o2 = join(tmp(), 'o2');
    expect(runPrepare(o1, [], { APS_TRIAL_SIGNING_KEY_FILE: keyFile }).status).toBe(0);
    expect(runPrepare(o2, [], { APS_TRIAL_SIGNING_KEY_FILE: keyFile }).status).toBe(0);
    expect(read(o1).envelope.keyId).toBe(read(o2).envelope.keyId);
    expect(read(o1).envelope.keyId).toMatch(/^trial-[0-9a-f]{8}$/);
    expect(JSON.parse(readFileSync(join(o1, 'info.json'), 'utf8')).ephemeral).toBe(false);
    for (const f of files(o1)) expect(readFileSync(f, 'latin1')).not.toMatch(/PRIVATE KEY/);
    const inRepo = join(repo, 'apps', 'desktop', '.trial-test.key.pem');
    writeFileSync(inRepo, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    try {
      const r = runPrepare(join(tmp(), 'o3'), [], { APS_TRIAL_SIGNING_KEY_FILE: inRepo });
      expect(r.status).toBe(1);
      expect(r.stderr).toMatch(/TRONG repo/);
    } finally {
      rmSync(inRepo, { force: true });
    }
  });

  it('pnpm package --installer từ chối chạy ngoài Windows (không cho đóng gói chéo âm thầm)', () => {
    if (process.platform === 'win32') return;
    const r = spawnSync(process.execPath, [resolve(import.meta.dirname, '..', 'scripts', 'package.mjs'), '--installer'], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/chỉ hỗ trợ trên Windows/);
  });
});
