#!/usr/bin/env node
// `pnpm dev:keys`: tạo khóa DEV (nếu chưa có) và ký manifest vào .dev-keys/ để chạy thử. KHÔNG dùng cho bản phát hành.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateEd25519, repoRoot, signManifestFile } from './lib.mjs';

const dir = join(repoRoot, '.dev-keys');
if (!existsSync(join(dir, 'dev-1.key.pem'))) {
  generateEd25519(dir, 'dev-1', { allowInsideRepo: true });
  console.log('Đã tạo khóa DEV trong .dev-keys/ (gitignore).');
}
signManifestFile({
  manifestPath: join(repoRoot, 'tools', 'runtime', 'manifest.json'),
  keyPath: join(dir, 'dev-1.key.pem'),
  keyId: 'dev-1',
  outPath: join(dir, 'runtime-manifest.signed.json'),
});
console.log('Đã ký manifest DEV ->', join(dir, 'runtime-manifest.signed.json'));
console.log('Chạy thử: APS_DEV_TRUST_KEY_FILE=.dev-keys/dev-1.pub.pem (CLI/`pnpm dev` tự đặt biến này khi có .dev-keys/).');
