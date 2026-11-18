#!/usr/bin/env node
// Chuẩn bị khóa công khai + manifest đã ký cho bản cài THỬ NGHIỆM (installer Windows gửi khách dùng thử).
//
//   node tools/trial/prepare-trial-keys.mjs [--mode auto|trial|production] [--out apps/desktop/.trial-staging]
//
//   auto (mặc định): nếu repo ĐÃ có khóa công khai production (resources/keys/production/<keyId>.pub.pem) và manifest production đã ký
//                    (resources/runtime-manifest.signed.json) khớp khóa đó -> dùng đúng chúng ("production").
//                    Nếu chưa có khóa production -> dùng khóa TRIAL riêng ("trial").
//   trial:           luôn dùng khóa trial.
//   production:      bắt buộc phải có khóa + manifest production, thiếu thì lỗi (không tự lùi về trial).
//
// Khóa TRIAL: keyId `trial-<ngày>-<6 hex>`, KHÔNG bắt đầu bằng "dev". Mặc định cặp khóa Ed25519 được sinh tạm ở thư mục tạm NGOÀI repo,
// dùng ký manifest rồi XÓA ngay: không ai ký thêm được cho bản đã phát hành, khóa riêng không tồn tại ở đâu cả.
// Muốn giữ một khóa trial cố định giữa các lần build (ví dụ để cập nhật manifest cho cùng installer), đặt APS_TRIAL_SIGNING_KEY_FILE=<khóa riêng,
// nằm NGOÀI repo> (CI: ghi từ GitHub Secret ra RUNNER_TEMP). Khóa đó vẫn không bao giờ vào repo hay installer.
//
// Đầu ra trong --out: keys/production/<keyId>.pub.pem, runtime-manifest.signed.json, info.json (chỉ để đọc; không đóng gói).
// In ra APS_PACKAGE_KEYS_DIR / APS_PACKAGE_MANIFEST cho scripts/package.mjs, và ghi vào $GITHUB_OUTPUT nếu có.
import { createHash, createPrivateKey, createPublicKey, randomBytes, verify } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { die, generateEd25519, isInsideRepo, parseArgs, repoRoot, signManifestFile } from '../runtime/lib.mjs';

const args = parseArgs(process.argv.slice(2));
const mode = args.mode && args.mode !== true ? String(args.mode) : 'auto';
if (!['auto', 'trial', 'production'].includes(mode)) die('--mode phải là auto, trial hoặc production');
const desktop = join(repoRoot, 'apps', 'desktop');
const out = resolve(args.out && args.out !== true ? args.out : join(desktop, '.trial-staging'));
const manifestPath = resolve(args.manifest && args.manifest !== true ? args.manifest : join(repoRoot, 'tools', 'runtime', 'manifest.json'));
// --prod-keys / --prod-manifest chỉ để kiểm thử; mặc định là nơi người phát hành đặt khóa/manifest production.
const prodKeysDir = resolve(args['prod-keys'] && args['prod-keys'] !== true ? args['prod-keys'] : join(desktop, 'resources', 'keys', 'production'));
const prodManifest = resolve(args['prod-manifest'] && args['prod-manifest'] !== true ? args['prod-manifest'] : join(desktop, 'resources', 'runtime-manifest.signed.json'));

function productionAvailable() {
  const pubs = existsSync(prodKeysDir) ? readdirSync(prodKeysDir).filter((f) => f.endsWith('.pub.pem')) : [];
  if (pubs.length === 0) return { ok: false, why: 'chưa có khóa công khai production trong resources/keys/production/' };
  if (!existsSync(prodManifest)) return { ok: false, why: 'chưa có resources/runtime-manifest.signed.json (manifest production đã ký)' };
  const env = JSON.parse(readFileSync(prodManifest, 'utf8'));
  const pub = pubs.find((f) => f === `${env.keyId}.pub.pem`);
  if (!pub) return { ok: false, why: `manifest production ký bởi "${env.keyId}" nhưng khóa đó không có trong resources/keys/production/` };
  const good = verify(null, Buffer.from(env.manifest, 'utf8'), createPublicKey(readFileSync(join(prodKeysDir, pub), 'utf8')), Buffer.from(env.signature, 'base64'));
  return good ? { ok: true, keyId: env.keyId } : { ok: false, why: 'chữ ký manifest production KHÔNG khớp khóa công khai production' };
}

const prod = mode === 'trial' ? { ok: false, why: 'ép dùng khóa trial' } : productionAvailable();
if (mode === 'production' && !prod.ok) die(`không dùng được khóa production: ${prod.why}`);

rmSync(out, { recursive: true, force: true });
const keysOut = join(out, 'keys', 'production');
mkdirSync(keysOut, { recursive: true });
const manifestOut = join(out, 'runtime-manifest.signed.json');
let keyMode;
let keyId;

if (prod.ok) {
  keyMode = 'production';
  keyId = prod.keyId;
  for (const f of readdirSync(prodKeysDir)) if (f.endsWith('.pub.pem')) copyFileSync(join(prodKeysDir, f), join(keysOut, f));
  copyFileSync(prodManifest, manifestOut);
} else {
  keyMode = 'trial';
  const scratch = mkdtempSync(join(tmpdir(), 'aps-trial-key-'));
  try {
    let keyPath;
    const fixed = process.env.APS_TRIAL_SIGNING_KEY_FILE;
    if (fixed) {
      if (isInsideRepo(fixed)) die('APS_TRIAL_SIGNING_KEY_FILE nằm TRONG repo; khóa riêng phải ở ngoài repo');
      keyPath = resolve(fixed);
      const pubPem = createPublicKey(createPrivateKey(readFileSync(keyPath, 'utf8'))).export({ type: 'spki', format: 'der' });
      keyId = `trial-${createHash('sha256').update(pubPem).digest('hex').slice(0, 8)}`;
    } else {
      keyId = `trial-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(3).toString('hex')}`;
      keyPath = generateEd25519(scratch, keyId).priv;
    }
    const pubPem = signManifestFile({ manifestPath, keyPath, keyId, outPath: manifestOut });
    writeFileSync(join(keysOut, `${keyId}.pub.pem`), pubPem);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const info = { keyMode, keyId, ephemeral: keyMode === 'trial' && !process.env.APS_TRIAL_SIGNING_KEY_FILE, generatedAt: new Date().toISOString() };
writeFileSync(join(out, 'info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Khóa cho bản cài: ${keyMode.toUpperCase()} (keyId ${keyId})${info.ephemeral ? ' - khóa riêng đã bị xóa ngay sau khi ký' : ''}`);
if (keyMode === 'trial') console.log('Chưa có khóa production trong repo, nên bản thử dùng khóa trial riêng (xem docs/ops/runtime-signing.md, mục "Bản thử nghiệm").');
console.log(`APS_PACKAGE_KEYS_DIR=${keysOut}`);
console.log(`APS_PACKAGE_MANIFEST=${manifestOut}`);
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `keys_dir=${keysOut}\nmanifest=${manifestOut}\nkey_mode=${keyMode}\nkey_id=${keyId}\n`);
}
