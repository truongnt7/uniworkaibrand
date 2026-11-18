#!/usr/bin/env node
// Cổng kiểm tra bản phát hành.
//   --pre  <keysDir> <signedManifest>   trước khi đóng gói: có khóa công khai production hợp lệ, manifest ký đúng bằng khóa đó,
//                                       manifest có FFmpeg LGPL, không có khóa riêng/khóa dev nào lẫn vào.
//   --post <appResourcesDir>            sau khi đóng gói: không có khóa riêng, không có dấu vết khóa dev/mã nạp khóa dev.
import { createPublicKey, verify } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [mode, a, b] = process.argv.slice(2);
const problems = [];
const fail = (m) => problems.push(m);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function scanForSecrets(root) {
  for (const f of walk(root)) {
    if (statSync(f).size > 600 * 1024 * 1024) continue;
    const buf = readFileSync(f);
    const text = buf.toString('latin1');
    if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/.test(text)) fail(`chứa KHÓA RIÊNG: ${f}`);
    if (/\.key\.pem|dev-signing-key/.test(text) && /\.(js|json|asar|pem|md)$/.test(f)) fail(`có tham chiếu tới file khóa riêng: ${f}`);
  }
}

if (mode === '--pre') {
  const keysDir = resolve(a ?? '');
  const manifestPath = resolve(b ?? '');
  if (!existsSync(keysDir)) fail(`không có thư mục khóa production: ${keysDir}`);
  const pubs = existsSync(keysDir) ? readdirSync(keysDir).filter((f) => f.endsWith('.pub.pem')) : [];
  if (pubs.length === 0) fail(`CHƯA có khóa công khai production trong ${keysDir} (cần <keyId>.pub.pem; xem docs/runtime-signing.md)`);
  const keys = new Map();
  for (const f of pubs) {
    const id = f.slice(0, -'.pub.pem'.length);
    if (id.toLowerCase().startsWith('dev')) fail(`khóa production không được đặt tên như khóa dev: ${f}`);
    try {
      const pem = readFileSync(join(keysDir, f), 'utf8');
      if (/PRIVATE KEY/.test(pem)) fail(`${f} là khóa RIÊNG`);
      const k = createPublicKey(pem);
      if (k.asymmetricKeyType !== 'ed25519') fail(`${f} không phải Ed25519`);
      keys.set(id, k);
    } catch (e) {
      fail(`${f} không đọc được: ${e.message}`);
    }
  }
  if (!existsSync(manifestPath)) fail(`chưa có manifest đã ký: ${manifestPath}`);
  else {
    const env = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const key = keys.get(env.keyId);
    if (!key) fail(`manifest ký bởi keyId "${env.keyId}" không có trong ${keysDir}`);
    else if (!verify(null, Buffer.from(env.manifest, 'utf8'), key, Buffer.from(env.signature, 'base64'))) fail('chữ ký manifest KHÔNG khớp khóa công khai production');
    const m = JSON.parse(env.manifest);
    if (!m.ffmpeg || m.ffmpeg.license !== 'LGPL-3.0-or-later') fail('manifest thiếu FFmpeg LGPL đã ghim');
    for (const [name, c] of [['blender', m.blender], ['ffmpeg', m.ffmpeg]]) {
      for (const [plat, art] of Object.entries(c?.artifacts ?? {})) if (!/^[0-9a-f]{64}$/.test(art.sha256)) fail(`${name}/${plat}: sha256 không hợp lệ`);
    }
  }
  if (existsSync(keysDir)) scanForSecrets(keysDir);
} else if (mode === '--post') {
  const root = resolve(a ?? '');
  if (!existsSync(root)) fail(`không có thư mục: ${root}`);
  else {
    scanForSecrets(root);
    for (const f of walk(root)) {
      if (!/\.(js|cjs|mjs|json|asar|html)$/.test(f)) continue;
      const text = readFileSync(f).toString('latin1');
      if (text.includes('APS_DEV_TRUST_KEY_FILE')) fail(`bản phát hành còn mã nạp khóa DEV (APS_DEV_TRUST_KEY_FILE): ${f}`);
      if (/"keyId":\s*"dev-/.test(text)) fail(`manifest ký bằng khóa dev nằm trong bản phát hành: ${f}`);
    }
    const keysDir = join(root, 'keys', 'production');
    const pubs = existsSync(keysDir) ? readdirSync(keysDir).filter((f) => f.endsWith('.pub.pem')) : [];
    if (pubs.length === 0) fail('bản phát hành không chứa khóa công khai production');
    if (pubs.some((f) => f.startsWith('dev'))) fail('bản phát hành chứa khóa dev');
    if (!existsSync(join(root, 'runtime-manifest.signed.json'))) fail('bản phát hành thiếu runtime-manifest.signed.json');
    for (const f of ['BeVietnamPro-Bold.ttf', 'OFL.txt']) if (!existsSync(join(root, 'fonts', f))) fail(`bản phát hành thiếu phông tiếng Việt: fonts/${f}`);
    if (!existsSync(join(root, 'licenses', 'libheif-js-LICENSE'))) fail('bản phát hành thiếu giấy phép LGPL của libheif-js: licenses/libheif-js-LICENSE');
    if (!existsSync(join(root, 'THIRD_PARTY_NOTICES.md'))) fail('bản phát hành thiếu THIRD_PARTY_NOTICES.md');
  }
} else {
  fail('dùng: check-release.mjs --pre <keysDir> <signedManifest> | --post <resourcesDir>');
}

if (problems.length) {
  console.error('KHÔNG ĐẠT kiểm tra phát hành:\n - ' + problems.join('\n - '));
  process.exit(1);
}
console.log(`ĐẠT kiểm tra phát hành (${mode}).`);
