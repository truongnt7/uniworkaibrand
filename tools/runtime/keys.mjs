#!/usr/bin/env node
// Sinh cặp khóa ký manifest Ed25519.
//
//   PRODUCTION (làm OFFLINE, trên máy bạn tin cậy; khóa riêng không bao giờ vào repo/installer):
//     node tools/runtime/keys.mjs gen-prod --out /đường/dẫn/an/toàn --key-id prod-2026
//   -> /đường/dẫn/an/toàn/prod-2026.key.pem   (RIÊNG, chmod 600, tự bảo quản/sao lưu)
//   -> /đường/dẫn/an/toàn/prod-2026.pub.pem   (CÔNG KHAI; chép vào apps/desktop/resources/keys/production/)
//
//   DEV (chỉ để chạy thử trên máy dev; app phát hành không bao giờ tin khóa này):
//     node tools/runtime/keys.mjs gen-dev      -> .dev-keys/dev-1.{key,pub}.pem (gitignore)
import { join } from 'node:path';
import { die, generateEd25519, parseArgs, repoRoot } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];

if (cmd === 'gen-prod') {
  if (!args.out || args.out === true) die('thiếu --out <thư mục ngoài repo>');
  const keyId = args['key-id'] && args['key-id'] !== true ? args['key-id'] : 'prod-1';
  if (!/^[a-z0-9][a-z0-9._-]{2,40}$/.test(keyId) || keyId.startsWith('dev')) die('key-id phải khớp ^[a-z0-9][a-z0-9._-]{2,40}$ và không được bắt đầu bằng "dev"');
  const { priv, pub } = generateEd25519(args.out, keyId);
  console.log(`Đã tạo khóa PRODUCTION.\n  RIÊNG (giữ bí mật, KHÔNG commit, KHÔNG đưa vào installer): ${priv}\n  CÔNG KHAI (chép vào apps/desktop/resources/keys/production/): ${pub}`);
} else if (cmd === 'gen-dev') {
  const { priv, pub } = generateEd25519(join(repoRoot, '.dev-keys'), 'dev-1', { allowInsideRepo: true });
  console.log(`Đã tạo khóa DEV (.dev-keys/ đã gitignore):\n  ${priv}\n  ${pub}`);
} else {
  die('dùng: keys.mjs gen-prod --out <dir> [--key-id prod-2026] | gen-dev');
}
