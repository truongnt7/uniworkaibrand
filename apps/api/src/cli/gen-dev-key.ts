import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Sinh khóa ký manifest DÙNG CHO DEV (keyId dev-*) và ghi vào apps/api/.env (đã gitignore).
 * Không bao giờ dùng cho production: production chỉ nhận keyId prod-* với khóa do hạ tầng cấp.
 */
if (process.env.APS_ENV === 'production') {
  console.error('Từ chối sinh khóa dev trong production.');
  process.exit(1);
}
const envFile = resolve(__dirname, '..', '..', '.env');
const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
const keyId = `dev-${new Date().toISOString().slice(0, 10)}-${randomBytes(3).toString('hex')}`;

const set = (text: string, key: string, value: string) => {
  const line = `${key}=${value}`;
  return new RegExp(`^${key}=.*$`, 'm').test(text) ? text.replace(new RegExp(`^${key}=.*$`, 'm'), () => line) : `${text.replace(/\n*$/, '\n')}${line}\n`;
};
let text = existsSync(envFile) ? readFileSync(envFile, 'utf8') : '';
text = set(text, 'MANIFEST_SIGNING_KEY', privatePem.trim().replace(/\n/g, '\\n'));
text = set(text, 'MANIFEST_KEY_ID', keyId);
writeFileSync(envFile, text, { mode: 0o600 });

console.log(`Đã ghi MANIFEST_SIGNING_KEY và MANIFEST_KEY_ID=${keyId} vào ${envFile}`);
console.log('Khóa công khai (nhúng vào desktop dev, ví dụ apps/desktop/resources/manifest-public-key.pem):\n');
console.log(publicPem);
