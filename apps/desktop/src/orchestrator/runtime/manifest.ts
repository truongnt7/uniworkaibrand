import { createPublicKey, verify } from 'node:crypto';
import {
  AppError,
  RuntimeManifest,
  SignedManifest,
  type RuntimeArtifact,
  type RuntimePlatformKey,
} from '@aps/shared';
import type { TrustedKey } from './trust.js';

export function currentPlatformKey(platform: string = process.platform, arch: string = process.arch): string {
  return `${platform}-${arch}`;
}

export interface ManifestTrust {
  keys: readonly TrustedKey[];
  /** Chỉ dùng trong test: chấp nhận manifest không ký. Không có đường nào bật cờ này trong app. */
  allowUnsigned?: boolean;
}

/**
 * Kiểm tra chữ ký Ed25519 trên đúng chuỗi manifest bằng khóa có `keyId` khớp trong tập khóa tin cậy, rồi parse + validate schema.
 * Không có khóa tin cậy nào (bản chưa cấu hình khóa production) -> từ chối rõ ràng, không "mở cửa" mặc định.
 */
export function parseSignedManifest(raw: unknown, trust: ManifestTrust): RuntimeManifest {
  const envelope = SignedManifest.safeParse(raw);
  if (!envelope.success) {
    if (trust.allowUnsigned) return parseManifestText(typeof raw === 'string' ? raw : JSON.stringify(raw));
    throw new AppError('MANIFEST_INVALID', 'manifest không đúng định dạng phong bì ký');
  }
  if (trust.allowUnsigned && trust.keys.length === 0) return parseManifestText(envelope.data.manifest);
  if (trust.keys.length === 0) {
    throw new AppError('MANIFEST_NO_TRUSTED_KEY', 'bản này chưa được cấu hình khóa công khai production để kiểm tra manifest');
  }
  const keyId = envelope.data.keyId;
  const key = keyId ? trust.keys.find((k) => k.keyId === keyId) : undefined;
  if (!key) throw new AppError('MANIFEST_UNTRUSTED_KEY', `manifest được ký bởi khóa không được tin cậy: ${keyId ?? '(thiếu keyId)'}`);
  let ok = false;
  try {
    ok = verify(null, Buffer.from(envelope.data.manifest, 'utf8'), createPublicKey(key.publicKeyPem), Buffer.from(envelope.data.signature, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new AppError('MANIFEST_SIGNATURE_INVALID', 'chữ ký manifest không hợp lệ');
  return parseManifestText(envelope.data.manifest);
}

function parseManifestText(text: string): RuntimeManifest {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AppError('MANIFEST_INVALID', 'manifest không phải JSON');
  }
  const parsed = RuntimeManifest.safeParse(json);
  if (!parsed.success) {
    throw new AppError('MANIFEST_INVALID', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  return parsed.data;
}

export function selectArtifact(manifest: RuntimeManifest, platformKey: string = currentPlatformKey()): RuntimeArtifact {
  const art = manifest.blender.artifacts[platformKey as RuntimePlatformKey];
  if (!art) throw new AppError('PLATFORM_UNSUPPORTED', `không có runtime cho ${platformKey}`);
  return art;
}

export function selectFfmpegArtifact(manifest: RuntimeManifest, platformKey: string = currentPlatformKey()): RuntimeArtifact | null {
  if (!manifest.ffmpeg) return null;
  const art = manifest.ffmpeg.artifacts[platformKey];
  if (!art) throw new AppError('PLATFORM_UNSUPPORTED', `không có ffmpeg LGPL cho ${platformKey}`);
  return art;
}
