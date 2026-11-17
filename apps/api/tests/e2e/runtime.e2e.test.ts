import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RuntimeManifest, SignedManifest } from '@aps/shared';
import { verifyEnvelope } from '../../src/runtime/manifest-signer';
import { makePlatformAdmin, startApp, type Session, type TestCtx } from './harness';
import { testKeys } from './test-env';

let ctx: TestCtx;
let admin: Session;
beforeAll(async () => {
  ctx = await startApp();
  admin = await makePlatformAdmin(ctx);
});
afterAll(async () => { await ctx.close(); });

const art = (n: string) => ({ url: `https://cdn.example.com/${n}.zip`, size: 1000, sha256: 'a'.repeat(64), archive: 'zip', binary: `${n}/blender.exe` });
const manifest = (over: Record<string, unknown> = {}) => ({
  schemaVersion: 1,
  blender: { version: '4.5.16', channel: 'LTS', artifacts: { 'win32-x64': art('b') } },
  ffmpeg: { version: '7.1', license: 'LGPL-3.0-or-later', artifacts: { 'win32-x64': { ...art('f'), binary: 'ffmpeg.exe' } } },
  ...over,
});

describe('GET /runtime/manifest', () => {
  it('trả phong bì đã ký: chữ ký ed25519 hợp lệ trên đúng chuỗi manifest, đọc được bằng schema của desktop (@aps/shared)', async () => {
    const res = await ctx.http.get('/runtime/manifest');
    expect(res.status).toBe(200);
    const envelope = SignedManifest.parse(res.body);
    expect(envelope.keyId).toBe('dev-test-1');
    expect(verifyEnvelope(res.body, testKeys.publicPem)).toBe(true);

    const m = RuntimeManifest.parse(JSON.parse(envelope.manifest));
    expect(m.blender.version).toMatch(/^4\.5\./);
    expect(m.blender.channel).toBe('LTS');
    const raw = JSON.parse(envelope.manifest);
    expect(raw.environment).toBe('development');
    expect(raw.ffmpeg.license).toMatch(/^LGPL/);
    expect(Object.keys(raw.blender.artifacts)).toEqual(expect.arrayContaining(['linux-x64', 'win32-x64', 'darwin-arm64', 'darwin-x64']));
  });

  it('chữ ký ổn định giữa các lần gọi (ed25519 tất định) và bị vô hiệu nếu sửa 1 byte hoặc dùng khóa khác', async () => {
    const a = (await ctx.http.get('/runtime/manifest')).body;
    const b = (await ctx.http.get('/runtime/manifest')).body;
    expect(a).toEqual(b);
    expect(verifyEnvelope({ ...a, manifest: a.manifest.replace('4.5.16', '4.5.17') }, testKeys.publicPem)).toBe(false);
    const other = generateKeyPairSync('ed25519').publicKey.export({ type: 'spki', format: 'pem' }).toString();
    expect(verifyEnvelope(a, other)).toBe(false);
  });

  it('public-keys trả khóa công khai khớp với khóa ký và không bao giờ lộ khóa riêng', async () => {
    const res = await ctx.http.get('/runtime/public-keys');
    expect(res.body.keys).toHaveLength(1);
    expect(res.body.keys[0]).toMatchObject({ keyId: 'dev-test-1', algorithm: 'ed25519', environment: 'development' });
    expect(createPublicKey(res.body.keys[0].publicKeyPem).export({ type: 'spki', format: 'pem' })).toBe(testKeys.publicPem);
    expect(JSON.stringify(res.body)).not.toContain('PRIVATE');
  });

  it('admin phát hành manifest mới: kiểm schema (Blender 4.5.x LTS, ffmpeg LGPL, sha256, https) rồi kích hoạt', async () => {
    const bad = async (m: object) => (await ctx.http.put('/admin/runtime/releases').set(admin.auth).send({ manifest: m }));
    const blender5 = await bad(manifest({ blender: { version: '5.0.1', channel: 'LTS', artifacts: {} } }));
    expect(blender5.status).toBe(400);
    expect(blender5.body.code).toBe('RUNTIME_MANIFEST_INVALID');
    const gpl = await bad(manifest({ ffmpeg: { version: '7.1', license: 'GPL-3.0-or-later', artifacts: {} } }));
    expect(gpl.status).toBe(400);
    const sha = await bad(manifest({ blender: { version: '4.5.16', channel: 'LTS', artifacts: { 'win32-x64': { ...art('b'), sha256: 'XYZ' } } } }));
    expect(sha.status).toBe(400);
    const platform = await bad(manifest({ blender: { version: '4.5.16', channel: 'LTS', artifacts: { 'plan9-x64': art('b') } } }));
    expect(platform.status).toBe(400);

    const pub = await ctx.http.put('/admin/runtime/releases').set(admin.auth).send({ manifest: manifest(), note: 'test', activate: true });
    expect(pub.status).toBe(200);
    expect(pub.body.isActive).toBe(true);
    const served = (await ctx.http.get('/runtime/manifest')).body;
    expect(JSON.parse(served.manifest).releaseId).toBe(pub.body.id);
    expect(Object.keys(JSON.parse(served.manifest).blender.artifacts)).toEqual(['win32-x64']);
    expect(verifyEnvelope(served, testKeys.publicPem)).toBe(true);

    const releases = await ctx.http.get('/admin/runtime/releases').set(admin.auth);
    expect(releases.body.filter((r: { isActive: boolean }) => r.isActive)).toHaveLength(1);
  });

  it('endpoint phát hành chỉ dành cho platform admin', async () => {
    expect((await ctx.http.put('/admin/runtime/releases').send({ manifest: manifest() })).status).toBe(401);
  });
});

describe('khóa ký: dev tách khỏi production', () => {
  it('thiếu khóa ở môi trường dev -> 503 RUNTIME_SIGNING_UNAVAILABLE (không tự sinh khóa)', async () => {
    const keyless = await startApp({ MANIFEST_SIGNING_KEY: '', MANIFEST_KEY_ID: '' });
    try {
      const res = await keyless.http.get('/runtime/manifest');
      expect(res.status).toBe(503);
      expect(res.body.code).toBe('RUNTIME_SIGNING_UNAVAILABLE');
      expect((await keyless.http.get('/runtime/public-keys')).body.keys).toEqual([]);
    } finally {
      await keyless.close();
    }
  });

  it('production từ chối khóa dev-* và từ chối khởi động nếu thiếu khóa', async () => {
    const prodBase = { APS_ENV: 'production', JWT_ACCESS_SECRET: 'prod-secret-prod-secret-prod-secret-01234567' };
    await expect(startApp({ ...prodBase, MANIFEST_KEY_ID: 'dev-test-1' })).rejects.toThrow(/prod-/);
    await expect(startApp({ ...prodBase, MANIFEST_SIGNING_KEY: '', MANIFEST_KEY_ID: '' })).rejects.toThrow(/MANIFEST_SIGNING_KEY/);
  });

  it('production với khóa prod-* ký ra manifest environment=production', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const prod = await startApp({
      APS_ENV: 'production',
      JWT_ACCESS_SECRET: 'prod-secret-prod-secret-prod-secret-01234567',
      MANIFEST_SIGNING_KEY: Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()).toString('base64'),
      MANIFEST_KEY_ID: 'prod-2026-11',
      SWAGGER_ENABLED: 'false',
    });
    try {
      const res = await prod.http.get('/runtime/manifest');
      expect(res.status).toBe(200);
      expect(res.body.keyId).toBe('prod-2026-11');
      expect(JSON.parse(res.body.manifest).environment).toBe('production');
      expect(verifyEnvelope(res.body, publicKey.export({ type: 'spki', format: 'pem' }).toString())).toBe(true);
      // khóa dev của test không xác minh được manifest production
      expect(verifyEnvelope(res.body, testKeys.publicPem)).toBe(false);
      expect((await prod.http.get('/docs-json')).status).toBe(404);
    } finally {
      await prod.close();
    }
  });

  it('khóa không phải ed25519 hoặc rác bị từ chối khi khởi động', async () => {
    const { generateKeyPairSync: gen } = await import('node:crypto');
    const rsa = gen('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    await expect(startApp({ MANIFEST_SIGNING_KEY: rsa, MANIFEST_KEY_ID: 'dev-x' })).rejects.toThrow(/ed25519/);
    await expect(startApp({ MANIFEST_SIGNING_KEY: 'garbage', MANIFEST_KEY_ID: 'dev-x' })).rejects.toThrow(/PEM/);
  });
});
