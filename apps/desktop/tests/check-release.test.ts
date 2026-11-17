import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { makeKey } from './helpers-trust.js';

const script = resolve(import.meta.dirname, '..', 'scripts', 'check-release.mjs');
const manifestSrc = resolve(import.meta.dirname, '..', '..', '..', 'tools', 'runtime', 'manifest.json');
const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-rel-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
const manifestText = () => JSON.stringify(JSON.parse(readFileSync(manifestSrc, 'utf8')));

function stage(keyId = 'prod-2026', opts: { signerId?: string; extraFiles?: Record<string, string> } = {}) {
  const dir = tmp();
  const keys = join(dir, 'keys');
  mkdirSync(keys);
  const k = makeKey(keyId);
  writeFileSync(join(keys, `${keyId}.pub.pem`), k.trusted.publicKeyPem);
  const signer = opts.signerId ? makeKey(opts.signerId) : k;
  const manifest = join(dir, 'runtime-manifest.signed.json');
  writeFileSync(manifest, JSON.stringify(signer.signText(manifestText())));
  for (const [n, c] of Object.entries(opts.extraFiles ?? {})) writeFileSync(join(keys, n), c);
  return { keys, manifest, k };
}

describe('check-release --pre', () => {
  it('đạt khi có khóa công khai production và manifest ký đúng', () => {
    const s = stage();
    const r = run('--pre', s.keys, s.manifest);
    expect(r.status).toBe(0);
  });

  it('thất bại khi chưa điền khóa production (bản pilot không thể phát hành "mở cửa")', () => {
    const s = stage();
    rmSync(join(s.keys, 'prod-2026.pub.pem'));
    const r = run('--pre', s.keys, s.manifest);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/CHƯA có khóa công khai production/);
  });

  it('thất bại khi khóa tên dev-*, khóa riêng lẫn vào, hoặc manifest ký bằng khóa khác', () => {
    expect(run('--pre', stage('dev-1').keys, stage('dev-1').manifest).status).toBe(1);
    const priv = makeKey('x').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const withPriv = stage('prod-2026', { extraFiles: { 'oops.pem': priv } });
    const r1 = run('--pre', withPriv.keys, withPriv.manifest);
    expect(r1.status).toBe(1);
    expect(r1.stderr).toMatch(/KHÓA RIÊNG/);
    const other = stage('prod-2026', { signerId: 'prod-2026' });
    const r2 = run('--pre', other.keys, other.manifest);
    expect(r2.status).toBe(1);
    expect(r2.stderr).toMatch(/KHÔNG khớp/);
  });
});

describe('check-release --post', () => {
  function resources(extra: Record<string, string> = {}) {
    const s = stage();
    const root = tmp();
    mkdirSync(join(root, 'keys', 'production'), { recursive: true });
    writeFileSync(join(root, 'keys', 'production', 'prod-2026.pub.pem'), s.k.trusted.publicKeyPem);
    writeFileSync(join(root, 'runtime-manifest.signed.json'), readFileSync(s.manifest));
    writeFileSync(join(root, 'THIRD_PARTY_NOTICES.md'), '# notices');
    mkdirSync(join(root, 'fonts'), { recursive: true });
    writeFileSync(join(root, 'fonts', 'BeVietnamPro-Bold.ttf'), 'font');
    writeFileSync(join(root, 'fonts', 'OFL.txt'), 'OFL');
    for (const [n, c] of Object.entries(extra)) writeFileSync(join(root, n), c);
    return root;
  }

  it('đạt với tài nguyên sạch', () => {
    expect(run('--post', resources()).status).toBe(0);
  });

  it('từ chối bản thiếu phông tiếng Việt hoặc giấy phép OFL', () => {
    const root = resources();
    rmSync(join(root, 'fonts', 'OFL.txt'));
    const r = run('--post', root);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/fonts\/OFL.txt/);
  });

  it('thất bại nếu có khóa riêng, mã nạp khóa dev, hoặc manifest ký bằng khóa dev', () => {
    const priv = makeKey('x').privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(run('--post', resources({ 'leak.txt': priv })).status).toBe(1);
    expect(run('--post', resources({ 'app.js': 'process.env.APS_DEV_TRUST_KEY_FILE' })).status).toBe(1);
    expect(run('--post', resources({ 'm.json': '{"keyId": "dev-1"}' })).status).toBe(1);
  });
});
