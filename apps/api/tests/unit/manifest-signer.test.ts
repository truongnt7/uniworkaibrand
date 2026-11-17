import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeKeyMaterial, ManifestSigner, SigningConfigError, verifyEnvelope } from '../../src/runtime/manifest-signer';

const ed = () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return { priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), pub: publicKey.export({ type: 'spki', format: 'pem' }).toString() };
};

describe('ManifestSigner', () => {
  it('ký và xác minh; sửa 1 byte hoặc đổi khóa thì xác minh thất bại', () => {
    const k = ed();
    const s = new ManifestSigner('development', k.priv, 'dev-a');
    const env = s.sign('{"a":1}');
    expect(env.keyId).toBe('dev-a');
    expect(verifyEnvelope(env, k.pub)).toBe(true);
    expect(verifyEnvelope({ ...env, manifest: '{"a":2}' }, k.pub)).toBe(false);
    expect(verifyEnvelope(env, ed().pub)).toBe(false);
    expect(verifyEnvelope({ ...env, signature: 'AAAA' }, k.pub)).toBe(false);
    expect(verifyEnvelope(env, 'not a pem')).toBe(false);
    expect(s.publicKeyPem).toBe(k.pub);
  });

  it('chấp nhận PEM thô, PEM với \\n escape, và base64 của PEM', () => {
    const k = ed();
    for (const material of [k.priv, k.priv.replace(/\n/g, '\\n'), Buffer.from(k.priv).toString('base64')]) {
      expect(new ManifestSigner('development', material, 'dev-a').publicKeyPem).toBe(k.pub);
    }
    expect(() => decodeKeyMaterial('###')).toThrow(SigningConfigError);
  });

  it('khóa dev không dùng được ở production và ngược lại', () => {
    const k = ed();
    expect(() => new ManifestSigner('production', k.priv, 'dev-a')).toThrow(/prod-/);
    expect(() => new ManifestSigner('development', k.priv, 'prod-a')).toThrow(/dev-/);
    expect(() => new ManifestSigner('production', k.priv, 'staging-1')).toThrow(SigningConfigError);
    expect(() => new ManifestSigner('production', k.priv, 'prod-2026')).not.toThrow();
  });

  it('production bắt buộc có khóa; dev không có khóa thì ở trạng thái chưa cấu hình và không tự sinh khóa', () => {
    expect(() => new ManifestSigner('production', undefined, null)).toThrow(/MANIFEST_SIGNING_KEY/);
    const s = new ManifestSigner('development', undefined, null);
    expect(s.configured).toBe(false);
    expect(s.publicKeyPem).toBeNull();
    expect(() => s.sign('x')).toThrow(SigningConfigError);
  });

  it('thiếu keyId, khóa RSA hoặc khóa rác đều bị từ chối', () => {
    const k = ed();
    expect(() => new ManifestSigner('development', k.priv, null)).toThrow(/MANIFEST_KEY_ID/);
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(() => new ManifestSigner('development', rsa, 'dev-a')).toThrow(/ed25519/);
    expect(() => new ManifestSigner('development', '-----BEGIN PRIVATE KEY-----\nxxx\n-----END PRIVATE KEY-----', 'dev-a')).toThrow(SigningConfigError);
  });

  it('keyId chỉ chấp nhận ký tự an toàn', () => {
    const k = ed();
    expect(() => new ManifestSigner('development', k.priv, 'dev-A B')).toThrow(SigningConfigError);
    expect(() => new ManifestSigner('development', k.priv, 'dev-../x')).toThrow(SigningConfigError);
  });
});
