// `pnpm dev`: chạy electron-vite dev; nếu có .dev-keys/ (do `pnpm dev:keys` tạo) thì bật tin khóa DEV bằng biến môi trường
// (chỉ trong chế độ dev, không bao giờ trong bản đóng gói). Bản build release loại bỏ hoàn toàn đường mã này.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const devPub = resolve(repo, '.dev-keys', 'dev-1.pub.pem');
const env = { ...process.env };
if (existsSync(devPub) && !env.APS_DEV_TRUST_KEY_FILE) env.APS_DEV_TRUST_KEY_FILE = devPub;
const child = spawn(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'electron-vite', 'dev', ...process.argv.slice(2)], { stdio: 'inherit', env });
child.on('exit', (code) => process.exit(code ?? 0));
