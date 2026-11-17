import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

export const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, '..', '..');

export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else out[key] = argv[++i];
    } else out._.push(a);
  }
  return out;
}

export function die(msg) {
  console.error(`LỖI: ${msg}`);
  process.exit(1);
}

export function isInsideRepo(path) {
  const p = resolve(path);
  return p === repoRoot || p.startsWith(repoRoot + sep);
}

export function generateEd25519(keyDir, keyId, { allowInsideRepo = false } = {}) {
  const dir = resolve(keyDir);
  if (!allowInsideRepo && isInsideRepo(dir)) {
    die(`thư mục khóa ${dir} nằm TRONG repo. Khóa riêng không được để trong repo; hãy chọn nơi khác (USB/offline/trình quản lý bí mật).`);
  }
  mkdirSync(dir, { recursive: true });
  const priv = join(dir, `${keyId}.key.pem`);
  const pub = join(dir, `${keyId}.pub.pem`);
  if (existsSync(priv) || existsSync(pub)) die(`đã có ${priv} hoặc ${pub}; không ghi đè khóa hiện có`);
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  chmodSync(priv, 0o600);
  writeFileSync(pub, publicKey.export({ type: 'spki', format: 'pem' }));
  return { priv, pub };
}

export function signManifestFile({ manifestPath, keyPath, keyId, outPath }) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!manifest.ffmpeg) die('manifest thiếu mục "ffmpeg" (bắt buộc: bản phân phối phải kèm FFmpeg LGPL đã ghim)');
  const text = JSON.stringify(manifest);
  const privateKey = createPrivateKey(readFileSync(keyPath, 'utf8'));
  if (privateKey.asymmetricKeyType !== 'ed25519') die('khóa ký phải là Ed25519');
  const signature = sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64');
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, JSON.stringify({ manifest: text, signature, keyId }, null, 2) + '\n');
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
}

export async function sha256File(path) {
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest('hex');
}

export async function downloadVerified(url, dest, { sha256 }) {
  if (existsSync(dest) && (await sha256File(dest)) === sha256) return dest;
  mkdirSync(dirname(dest), { recursive: true });
  const part = `${dest}.part`;
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) die(`tải ${url} thất bại: HTTP ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part));
  const digest = await sha256File(part);
  if (digest !== sha256) {
    rmSync(part, { force: true });
    die(`sai sha256 cho ${url}\n  cần  ${sha256}\n  nhận ${digest}`);
  }
  renameSync(part, dest);
  return dest;
}

export function tar(args) {
  const r = spawnSync('tar', args, { stdio: 'inherit' });
  if (r.status !== 0) die(`tar ${args.join(' ')} thất bại`);
}
