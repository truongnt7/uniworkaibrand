import { createPrivateKey, createPublicKey, KeyObject, sign, verify } from 'node:crypto';

export interface SignedEnvelope {
  /** Chuỗi JSON đã tuần tự hóa; chữ ký phủ đúng từng byte của chuỗi này. */
  manifest: string;
  /** ed25519, base64. */
  signature: string;
  keyId: string;
}

const DEV_ID = /^dev-[a-z0-9._-]+$/;
const PROD_ID = /^prod-[a-z0-9._-]+$/;

export class SigningConfigError extends Error {}

/** Chấp nhận PEM trực tiếp, PEM với `\n` viết dạng chuỗi, hoặc base64 của PEM. */
export function decodeKeyMaterial(raw: string): string {
  const text = raw.trim().replace(/\\n/g, '\n');
  if (text.includes('-----BEGIN')) return text;
  const decoded = Buffer.from(text, 'base64').toString('utf8');
  if (!decoded.includes('-----BEGIN')) throw new SigningConfigError('MANIFEST_SIGNING_KEY không phải PEM hoặc base64 của PEM');
  return decoded;
}

/**
 * Ký manifest bằng khóa ed25519 chỉ lấy từ biến môi trường (không bao giờ đọc từ repo/đĩa).
 * production bắt buộc có khóa với keyId `prod-*`; môi trường khác chỉ nhận keyId `dev-*`,
 * nên khóa dev không thể "đội lốt" khóa production và ngược lại.
 */
export class ManifestSigner {
  private readonly privateKey: KeyObject | null;
  private readonly publicPem: string | null;

  constructor(
    readonly environment: 'development' | 'production',
    keyMaterial: string | undefined,
    readonly keyId: string | null,
  ) {
    const wantProd = environment === 'production';
    if (!keyMaterial) {
      if (wantProd) throw new SigningConfigError('production yêu cầu MANIFEST_SIGNING_KEY');
      this.privateKey = null;
      this.publicPem = null;
      return;
    }
    if (!keyId) throw new SigningConfigError('thiếu MANIFEST_KEY_ID');
    if (wantProd ? !PROD_ID.test(keyId) : !DEV_ID.test(keyId)) {
      throw new SigningConfigError(
        wantProd ? `production chỉ chấp nhận keyId dạng prod-*, nhận "${keyId}"` : `môi trường ${environment} chỉ chấp nhận keyId dạng dev-*, nhận "${keyId}"`,
      );
    }
    let key: KeyObject;
    try {
      key = createPrivateKey(decodeKeyMaterial(keyMaterial));
    } catch (e) {
      if (e instanceof SigningConfigError) throw e;
      throw new SigningConfigError('MANIFEST_SIGNING_KEY không đọc được (cần PKCS8 PEM ed25519)');
    }
    if (key.asymmetricKeyType !== 'ed25519') throw new SigningConfigError('MANIFEST_SIGNING_KEY phải là ed25519');
    this.privateKey = key;
    this.publicPem = createPublicKey(key).export({ type: 'spki', format: 'pem' }).toString();
  }

  get configured(): boolean {
    return this.privateKey !== null;
  }

  get publicKeyPem(): string | null {
    return this.publicPem;
  }

  sign(manifestText: string): SignedEnvelope {
    if (!this.privateKey || !this.keyId) throw new SigningConfigError('chưa cấu hình khóa ký');
    const signature = sign(null, Buffer.from(manifestText, 'utf8'), this.privateKey).toString('base64');
    return { manifest: manifestText, signature, keyId: this.keyId };
  }
}

/** Xác minh phong bì bằng khóa công khai (PEM). Dùng cho test/CLI; desktop làm tương tự bằng khóa nhúng sẵn. */
export function verifyEnvelope(envelope: SignedEnvelope, publicKeyPem: string): boolean {
  try {
    return verify(null, Buffer.from(envelope.manifest, 'utf8'), createPublicKey(publicKeyPem), Buffer.from(envelope.signature, 'base64'));
  } catch {
    return false;
  }
}
