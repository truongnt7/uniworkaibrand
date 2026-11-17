import { createPublicKey } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { AppError } from '@aps/shared';

/**
 * Chính sách tin cậy khóa ký manifest.
 *  - Bản phát hành (`release`) CHỈ tin các khóa production nằm trong `resources/keys/production/<keyId>.pub.pem`.
 *  - Khóa DEV (keyId bắt đầu bằng `dev-`) chỉ được nạp khi KHÔNG phải bản đóng gói, build không ở chế độ release
 *    (hằng `__APS_ALLOW_DEV_KEY__` do bundler thay thế, bản `electron-vite build` đặt false nên đoạn mã này bị loại bỏ)
 *    và biến môi trường dev được đặt tường minh.
 *  - Ở đây chỉ có khóa CÔNG KHAI; khóa riêng không bao giờ nằm trong repo hay installer.
 */
declare const __APS_ALLOW_DEV_KEY__: boolean | undefined;
const DEV_KEY_ALLOWED = typeof __APS_ALLOW_DEV_KEY__ === 'undefined' ? true : __APS_ALLOW_DEV_KEY__;

export const DEV_KEY_PREFIX = 'dev-';
const PUBLIC_KEY_SUFFIX = '.pub.pem';

export interface TrustedKey {
  keyId: string;
  publicKeyPem: string;
  origin: 'production' | 'dev';
}

export interface TrustOptions {
  /** Thư mục chứa khóa công khai production (`<keyId>.pub.pem`). */
  productionKeysDir: string | null;
  /** true cho app đã đóng gói / bản phát hành: tuyệt đối không nạp khóa dev. */
  release: boolean;
  env?: NodeJS.ProcessEnv;
}

export function validatePublicKeyPem(pem: string, source: string): string {
  if (/PRIVATE KEY/.test(pem)) throw new AppError('MANIFEST_INVALID', `${source}: chứa khóa RIÊNG, từ chối nạp`);
  try {
    const key = createPublicKey(pem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error(`loại khóa ${key.asymmetricKeyType}`);
  } catch (err) {
    throw new AppError('MANIFEST_INVALID', `${source}: không phải khóa công khai Ed25519 hợp lệ (${(err as Error).message})`);
  }
  return pem;
}

function keyIdFromFile(file: string): string {
  const name = basename(file);
  return name.endsWith(PUBLIC_KEY_SUFFIX) ? name.slice(0, -PUBLIC_KEY_SUFFIX.length) : name.replace(/\.pem$/, '');
}

async function loadProductionKeys(dir: string | null): Promise<TrustedKey[]> {
  if (!dir) return [];
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith(PUBLIC_KEY_SUFFIX)).sort();
  } catch {
    return [];
  }
  const keys: TrustedKey[] = [];
  for (const f of files) {
    const keyId = keyIdFromFile(f);
    if (keyId.toLowerCase().startsWith(DEV_KEY_PREFIX) || keyId.toLowerCase().startsWith('dev')) {
      throw new AppError('MANIFEST_INVALID', `khóa production không được đặt tên như khóa dev: ${f}`);
    }
    const pem = validatePublicKeyPem(await readFile(join(dir, f), 'utf8'), f);
    keys.push({ keyId, publicKeyPem: pem, origin: 'production' });
  }
  return keys;
}

export async function loadTrustedKeys(opts: TrustOptions): Promise<TrustedKey[]> {
  const keys = await loadProductionKeys(opts.productionKeysDir);
  if (DEV_KEY_ALLOWED && !opts.release) {
    const devFile = (opts.env ?? process.env)['APS_DEV_TRUST_KEY_FILE'];
    if (devFile) {
      const keyId = keyIdFromFile(devFile);
      if (!keyId.startsWith(DEV_KEY_PREFIX)) throw new AppError('MANIFEST_INVALID', `khóa dev phải có keyId bắt đầu bằng "${DEV_KEY_PREFIX}": ${devFile}`);
      keys.push({ keyId, publicKeyPem: validatePublicKeyPem(await readFile(devFile, 'utf8'), devFile), origin: 'dev' });
    }
  }
  return keys;
}
