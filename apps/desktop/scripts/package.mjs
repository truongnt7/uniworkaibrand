#!/usr/bin/env node
// `pnpm package`: build -> kiểm tra trước (khóa/manifest production) -> electron-builder --dir -> kiểm tra sau.
// Khóa công khai production và manifest ký do NGƯỜI DÙNG cung cấp (docs/runtime-signing.md); script không bao giờ tự sinh khóa.
//   Mặc định: apps/desktop/resources/keys/production/ và apps/desktop/resources/runtime-manifest.signed.json
//   Ghi đè (CI/test): APS_PACKAGE_KEYS_DIR, APS_PACKAGE_MANIFEST
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '..', '..');
const env = { ...process.env };
env.APS_PACKAGE_KEYS_DIR = resolve(env.APS_PACKAGE_KEYS_DIR ?? join(root, 'resources', 'keys', 'production'));
env.APS_PACKAGE_MANIFEST = resolve(env.APS_PACKAGE_MANIFEST ?? join(root, 'resources', 'runtime-manifest.signed.json'));
delete env.APS_DEV_TRUST_KEY_FILE;

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, env, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

run('node', ['scripts/check-release.mjs', '--pre', env.APS_PACKAGE_KEYS_DIR, env.APS_PACKAGE_MANIFEST]);
run(pnpm, ['exec', 'electron-vite', 'build', '--mode', 'production']);
run(pnpm, ['exec', 'electron-builder', '--dir', '--config', 'electron-builder.yml']);

const out = join(repo, 'release-build');
const unpacked = ['linux-unpacked', 'win-unpacked', 'mac', 'mac-arm64'].map((d) => join(out, d)).find(existsSync);
if (!unpacked) {
  console.error('Không thấy thư mục đầu ra của electron-builder trong', out);
  process.exit(1);
}
const resources = existsSync(join(unpacked, 'resources')) ? join(unpacked, 'resources') : join(unpacked, 'AI Product Studio.app', 'Contents', 'Resources');
run('node', ['scripts/check-release.mjs', '--post', resources]);
console.log('Đã đóng gói:', unpacked);
