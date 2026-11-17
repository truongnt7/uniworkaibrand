import { createPublicKey, verify } from 'node:crypto';
import {
  AppError,
  RuntimeManifest,
  SignedManifest,
  type RuntimeArtifact,
  type RuntimePlatformKey,
} from '@aps/shared';

export function currentPlatformKey(platform: string = process.platform, arch: string = process.arch): string {
  return `${platform}-${arch}`;
}

/** Kiểm tra chữ ký ed25519 trên đúng chuỗi manifest rồi parse + validate schema. */
export function parseSignedManifest(raw: unknown, publicKeyPem: string | null, allowUnsigned = false): RuntimeManifest {
  const envelope = SignedManifest.safeParse(raw);
  if (!envelope.success) {
    if (allowUnsigned) return parseManifestText(typeof raw === 'string' ? raw : JSON.stringify(raw));
    throw new AppError('MANIFEST_INVALID', 'manifest không đúng định dạng phong bì ký');
  }
  if (!publicKeyPem) {
    if (allowUnsigned) return parseManifestText(envelope.data.manifest);
    throw new AppError('MANIFEST_SIGNATURE_INVALID', 'thiếu khóa công khai để kiểm tra chữ ký');
  }
  let ok = false;
  try {
    ok = verify(
      null,
      Buffer.from(envelope.data.manifest, 'utf8'),
      createPublicKey(publicKeyPem),
      Buffer.from(envelope.data.signature, 'base64'),
    );
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
