import { generateKeyPairSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { RuntimeManifest } from '@aps/shared';
import { parseSignedManifest } from '../src/orchestrator/runtime/manifest.js';
import { loadTrustedKeys } from '../src/orchestrator/runtime/trust.js';
import { makeKey } from './helpers-trust.js';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-trust-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const writePub = (dir: string, id: string, pem: string) => writeFileSync(join(dir, `${id}.pub.pem`), pem);
const M: RuntimeManifest = {
  schemaVersion: 1,
  blender: { version: '4.5.16', channel: 'LTS', artifacts: { 'linux-x64': { url: 'https://e.test/b.tar.xz', mirrors: [], size: 1, sha256: 'a'.repeat(64), archive: 'tar.xz', binary: 'b' } } },
};

describe('tập khóa tin cậy', () => {
  it('nạp khóa production theo tên file, bỏ qua file khác', async () => {
    const dir = tmp();
    const k = makeKey('prod-2026');
    writePub(dir, 'prod-2026', k.trusted.publicKeyPem);
    writeFileSync(join(dir, 'README.md'), 'x');
    const keys = await loadTrustedKeys({ productionKeysDir: dir, release: true });
    expect(keys.map((x) => [x.keyId, x.origin])).toEqual([['prod-2026', 'production']]);
  });

  it('chưa điền khóa production (thư mục trống/không tồn tại) -> tập rỗng', async () => {
    expect(await loadTrustedKeys({ productionKeysDir: tmp(), release: true })).toEqual([]);
    expect(await loadTrustedKeys({ productionKeysDir: '/không/tồn/tại', release: true })).toEqual([]);
  });

  it('bản release KHÔNG bao giờ nạp khóa dev dù biến môi trường dev được đặt', async () => {
    const devDir = tmp();
    const dev = makeKey('dev-1');
    writePub(devDir, 'dev-1', dev.trusted.publicKeyPem);
    const env = { APS_DEV_TRUST_KEY_FILE: join(devDir, 'dev-1.pub.pem') };
    const keys = await loadTrustedKeys({ productionKeysDir: null, release: true, env });
    expect(keys).toEqual([]);
    expect(() => parseSignedManifest(dev.signText(JSON.stringify(M)), { keys })).toThrowError(expect.objectContaining({ code: 'MANIFEST_NO_TRUSTED_KEY' }));
  });

  it('bản release từ chối manifest ký bằng khóa dev (kể cả khi khóa dev nằm cạnh khóa production)', async () => {
    const prodDir = tmp();
    const prod = makeKey('prod-2026');
    writePub(prodDir, 'prod-2026', prod.trusted.publicKeyPem);
    const dev = makeKey('dev-1');
    const keys = await loadTrustedKeys({ productionKeysDir: prodDir, release: true, env: { APS_DEV_TRUST_KEY_FILE: '/x/dev-1.pub.pem' } });
    expect(() => parseSignedManifest(dev.signText(JSON.stringify(M)), { keys })).toThrowError(expect.objectContaining({ code: 'MANIFEST_UNTRUSTED_KEY' }));
    expect(parseSignedManifest(prod.signText(JSON.stringify(M)), { keys }).blender.version).toBe('4.5.16');
  });

  it('bản dev chỉ nạp khóa dev khi biến môi trường được đặt tường minh và keyId bắt đầu bằng "dev-"', async () => {
    const dir = tmp();
    const dev = makeKey('dev-1');
    writePub(dir, 'dev-1', dev.trusted.publicKeyPem);
    const file = join(dir, 'dev-1.pub.pem');
    expect(await loadTrustedKeys({ productionKeysDir: null, release: false, env: {} })).toEqual([]);
    const keys = await loadTrustedKeys({ productionKeysDir: null, release: false, env: { APS_DEV_TRUST_KEY_FILE: file } });
    expect(keys.map((k) => [k.keyId, k.origin])).toEqual([['dev-1', 'dev']]);

    writePub(dir, 'misc', dev.trusted.publicKeyPem);
    await expect(loadTrustedKeys({ productionKeysDir: null, release: false, env: { APS_DEV_TRUST_KEY_FILE: join(dir, 'misc.pub.pem') } })).rejects.toThrow(/dev-/);
  });

  it('từ chối khóa production đặt tên như khóa dev, khóa riêng, và khóa không phải Ed25519', async () => {
    const k = makeKey('x');
    const a = tmp();
    writePub(a, 'dev-prod', k.trusted.publicKeyPem);
    await expect(loadTrustedKeys({ productionKeysDir: a, release: true })).rejects.toThrow(/khóa dev/);

    const b = tmp();
    writePub(b, 'prod-1', k.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
    await expect(loadTrustedKeys({ productionKeysDir: b, release: true })).rejects.toThrow(/khóa RIÊNG/);

    const c = tmp();
    mkdirSync(c, { recursive: true });
    writePub(c, 'prod-1', generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' }).toString());
    await expect(loadTrustedKeys({ productionKeysDir: c, release: true })).rejects.toThrow(/Ed25519/);
  });
});
