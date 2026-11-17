#!/usr/bin/env node
// Ký manifest runtime bằng khóa riêng Ed25519 của bạn (offline).
//   node tools/runtime/sign-manifest.mjs --key /an/toan/prod-2026.key.pem --key-id prod-2026 \
//        [--manifest tools/runtime/manifest.json] [--out apps/desktop/resources/runtime-manifest.signed.json]
// Khóa production: key-id không được bắt đầu bằng "dev". Khóa dev chỉ dùng qua `pnpm dev:keys`.
import { join } from 'node:path';
import { die, isInsideRepo, parseArgs, repoRoot, signManifestFile } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
if (!args.key || args.key === true || !args['key-id'] || args['key-id'] === true) die('thiếu --key <khóa riêng .key.pem> và --key-id <id>');
const dev = String(args['key-id']).startsWith('dev-');
if (dev && !args['allow-dev']) die('key-id bắt đầu bằng "dev-" là khóa DEV; dùng `pnpm dev:keys` thay vì ký bản phát hành bằng khóa dev');
if (!dev && isInsideRepo(args.key)) die('khóa riêng production không được nằm trong repo');
const manifestPath = args.manifest && args.manifest !== true ? args.manifest : join(repoRoot, 'tools', 'runtime', 'manifest.json');
const outPath = args.out && args.out !== true ? args.out : join(repoRoot, 'apps', 'desktop', 'resources', 'runtime-manifest.signed.json');
signManifestFile({ manifestPath, keyPath: args.key, keyId: args['key-id'], outPath });
console.log(`Đã ký ${manifestPath} bằng khóa ${args['key-id']} -> ${outPath}\nNhớ chép public key tương ứng vào apps/desktop/resources/keys/production/${args['key-id']}.pub.pem`);
