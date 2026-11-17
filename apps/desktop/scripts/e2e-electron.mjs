// E2E: mở Electron thật (dưới Xvfb), tạo job ảnh EEVEE qua UI, chờ xong, chụp màn hình.
// Dùng: xvfb-run -a pnpm --filter @aps/desktop e2e   (cần `pnpm build` trước và Blender runtime đã cài ở APS_E2E_RUNTIME_DIR)
import { mkdirSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const dataDir = resolve(process.env.APS_E2E_DATA ?? '/tmp/aps-e2e-data');
const shotDir = resolve(process.env.APS_E2E_SHOTS ?? '/tmp/aps-e2e-shots');
const runtimeSrc = resolve(process.env.APS_E2E_RUNTIME_DIR ?? join(repo, '.poc-data', 'runtime'));
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });
if (existsSync(runtimeSrc)) symlinkSync(runtimeSrc, join(dataDir, 'runtime'));

const app = await electron.launch({
  args: [resolve(import.meta.dirname, '..'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  env: {
    ...process.env,
    APS_DATA_DIR: dataDir,
    APS_E2E_FILES: JSON.stringify({ glb: join(repo, 'assets/samples/serum-bottle.glb'), image: join(repo, 'assets/samples/label.png') }),
  },
});
const page = await app.firstWindow();
page.on('pageerror', (e) => console.error('[renderer error]', e.message));
await page.waitForSelector('[data-testid="job-form"]');
await page.screenshot({ path: join(shotDir, '1-form.png') });
await page.click('[data-testid="pick-glb"]');
await page.click('[data-testid="pick-label"]');
await page.selectOption('[data-testid="kind"]', 'image');
await page.selectOption('[data-testid="engine"]', 'eevee');
await page.selectOption('[data-testid="resolution"]', '1280x720');
await page.click('[data-testid="create-job"]');
await page.waitForSelector('[data-testid="job-item"]');
await page.screenshot({ path: join(shotDir, '2-running.png') });
await page.waitForSelector('[data-testid="job-item"][data-status="done"]', { timeout: 240_000 });
await page.waitForSelector('[data-testid="job-image"]');
await page.waitForTimeout(800);
await page.screenshot({ path: join(shotDir, '3-done.png') });
console.log('E2E OK ->', shotDir);
await app.close();
