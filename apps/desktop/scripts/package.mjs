#!/usr/bin/env node
// `pnpm package`: build -> kiểm tra trước (khóa/manifest production) -> electron-builder --dir -> kiểm tra sau.
// `pnpm package --installer` (chỉ trên Windows): thay `--dir` bằng installer NSIS x64 (bản cài thử; CHƯA ký số, xem docs/ops/windows-trial-installer.md).
// Khóa công khai production và manifest ký do NGƯỜI DÙNG cung cấp (docs/runtime-signing.md); script không bao giờ tự sinh khóa.
//   Mặc định: apps/desktop/resources/keys/production/ và apps/desktop/resources/runtime-manifest.signed.json
//   Ghi đè (CI/test): APS_PACKAGE_KEYS_DIR, APS_PACKAGE_MANIFEST (bản thử: tools/trial/prepare-trial-keys.mjs in ra hai đường dẫn này)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

const installer = process.argv.includes('--installer');
if (installer && process.platform !== 'win32') {
  console.error('--installer chỉ hỗ trợ trên Windows (cần NSIS native; không build chéo từ Linux/macOS).');
  process.exit(1);
}
const root = resolve(import.meta.dirname, '..');
const repo = resolve(root, '..', '..');
const env = { ...process.env };
env.APS_PACKAGE_KEYS_DIR = resolve(env.APS_PACKAGE_KEYS_DIR ?? join(root, 'resources', 'keys', 'production'));
env.APS_PACKAGE_MANIFEST = resolve(env.APS_PACKAGE_MANIFEST ?? join(root, 'resources', 'runtime-manifest.signed.json'));
delete env.APS_DEV_TRUST_KEY_FILE;

const run = (cmd, args, opts = {}) => {
  // Node >= 20.12 không cho spawn trực tiếp file .cmd (EINVAL): trên Windows chạy pnpm.cmd qua shell; đối số ở đây là hằng, không có dữ liệu ngoài.
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, env, shell: cmd.endsWith('.cmd'), ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

run('node', ['scripts/check-release.mjs', '--pre', env.APS_PACKAGE_KEYS_DIR, env.APS_PACKAGE_MANIFEST]);
const staging = join(root, '.package-staging');
rmSync(staging, { recursive: true, force: true });
rmSync(join(repo, 'release-build'), { recursive: true, force: true });
mkdirSync(join(staging, 'keys', 'production'), { recursive: true });
for (const f of readdirSync(env.APS_PACKAGE_KEYS_DIR)) {
  if (f.endsWith('.pub.pem')) copyFileSync(join(env.APS_PACKAGE_KEYS_DIR, f), join(staging, 'keys', 'production', f));
}
copyFileSync(env.APS_PACKAGE_MANIFEST, join(staging, 'runtime-manifest.signed.json'));
run(pnpm, ['exec', 'electron-vite', 'build', '--mode', 'production']);
run(pnpm, ['exec', 'electron-builder', ...(installer ? ['--win', 'nsis', '--x64'] : ['--dir']), '--config', 'electron-builder.yml']);

const out = join(repo, 'release-build');
const unpacked = ['linux-unpacked', 'win-unpacked', 'mac', 'mac-arm64'].map((d) => join(out, d)).find(existsSync);
if (!unpacked) {
  console.error('Không thấy thư mục đầu ra của electron-builder trong', out);
  process.exit(1);
}
const resources = existsSync(join(unpacked, 'resources')) ? join(unpacked, 'resources') : join(unpacked, 'AI Product Studio.app', 'Contents', 'Resources');
run('node', ['scripts/check-release.mjs', '--post', resources]);
console.log('Đã đóng gói:', unpacked);
if (installer) {
  const exes = readdirSync(out).filter((f) => f.endsWith('.exe'));
  if (exes.length !== 1) {
    console.error(`Phải có đúng 1 installer .exe trong ${out}, thấy: ${exes.join(', ') || '(không có)'}`);
    process.exit(1);
  }
  console.log('Installer:', join(out, exes[0]));
}
