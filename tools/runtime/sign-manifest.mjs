#!/usr/bin/env node
// Ký manifest runtime bằng ed25519.
//   node tools/runtime/sign-manifest.mjs            -> dùng/ tạo khóa DEV (tools/runtime/dev-signing-key.pem, đã gitignore)
//   APS_MANIFEST_SIGNING_KEY=<PEM> node ...         -> dùng khóa thật (CI/HSM)
// Ghi apps/desktop/resources/runtime-manifest.signed.json và manifest-public-key.pem.
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', '..', 'apps', 'desktop', 'resources');
const manifestText = JSON.stringify(JSON.parse(readFileSync(join(here, 'manifest.json'), 'utf8')));

let privatePem = process.env.APS_MANIFEST_SIGNING_KEY;
const devKeyPath = join(here, 'dev-signing-key.pem');
if (!privatePem) {
  if (!existsSync(devKeyPath)) {
    const { privateKey } = generateKeyPairSync('ed25519');
    writeFileSync(devKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    console.log('Đã tạo khóa ký DEV mới:', devKeyPath, '(KHÔNG dùng cho bản phát hành)');
  }
  privatePem = readFileSync(devKeyPath, 'utf8');
}
const privateKey = createPrivateKey(privatePem);
const publicPem = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
const signature = sign(null, Buffer.from(manifestText, 'utf8'), privateKey).toString('base64');

writeFileSync(join(outDir, 'runtime-manifest.signed.json'), JSON.stringify({ manifest: manifestText, signature, keyId: 'dev-1' }, null, 2) + '\n');
writeFileSync(join(outDir, 'manifest-public-key.pem'), publicPem);
console.log('Đã ký manifest ->', join(outDir, 'runtime-manifest.signed.json'));
