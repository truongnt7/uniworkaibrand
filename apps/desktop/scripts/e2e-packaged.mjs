// E2E trên APP ĐÓNG GÓI (release-build/linux-unpacked) dưới Xvfb:
//   1) nhập gói runtime offline (.apspack) qua UI (xác minh chữ ký production + sha256, cài Blender + FFmpeg LGPL)
//   2) tạo job video, kill -9 cả app giữa lúc render
//   3) mở lại: hàng đợi SQLite (node:sqlite trong Electron đóng gói) khôi phục job, tiếp tục từ khung đã có, ra mp4 H.264
// Dùng: APS_E2E_PACK=<file.apspack> xvfb-run -a node scripts/e2e-packaged.mjs [thư mục app đóng gói]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const appDir = resolve(process.argv[2] ?? join(repo, 'release-build', 'linux-unpacked'));
const exe = join(appDir, 'ai-product-studio');
const pack = process.env.APS_E2E_PACK ?? '';
const dataDir = resolve(process.env.APS_E2E_DATA ?? '/tmp/aps-e2e-packaged-data');
const shots = resolve(process.env.APS_E2E_SHOTS ?? '/tmp/aps-e2e-packaged-shots');
if (!existsSync(exe)) throw new Error(`không thấy app đóng gói: ${exe}`);
if (!existsSync(pack)) throw new Error('đặt APS_E2E_PACK=<file .apspack>');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(shots, { recursive: true });

const log = (...a) => console.log('[e2e-packaged]', ...a);
const launch = () =>
  electron.launch({
    executablePath: exe,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    env: {
      ...process.env,
      APS_DATA_DIR: dataDir,
      APS_E2E: '1',
      APS_E2E_FILES: JSON.stringify({
        runtime: pack,
        glb: join(repo, 'assets/samples/serum-bottle.glb'),
        image: join(repo, 'assets/samples/label.png'),
      }),
    },
  });
const db = () => new DatabaseSync(join(dataDir, 'aps.sqlite'), { readOnly: true });
const jobRow = () => {
  const d = db();
  try {
    return d.prepare('SELECT id,status,frame,total_frames,attempts,failures,output_path,error_code FROM jobs ORDER BY created_at DESC LIMIT 1').get();
  } finally {
    d.close();
  }
};
const until = async (fn, ms, what) => {
  const t = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t > ms) throw new Error(`quá thời gian chờ: ${what}`);
    await new Promise((r) => setTimeout(r, 500));
  }
};

// ---- Giai đoạn A ----
let app = await launch();
let page = await app.firstWindow();
page.on('pageerror', (e) => console.error('[renderer error]', e.message));
await page.waitForSelector('[data-testid="job-form"]');
if ((await page.locator('[data-testid="runtime-installed"]').count()) !== 0) throw new Error('runtime không được có sẵn trên data dir mới');
log('app đóng gói chạy; runtime chưa cài. Nhập gói offline...');
await page.screenshot({ path: join(shots, '1-fresh.png') });
await page.click('[data-testid="runtime-import"]');
await page.waitForSelector('[data-testid="runtime-installed"]', { timeout: 420_000 });
log('đã cài runtime từ gói offline');
await page.screenshot({ path: join(shots, '2-runtime.png') });

await page.click('[data-testid="pick-glb"]');
await page.click('[data-testid="pick-label"]');
await page.selectOption('[data-testid="kind"]', 'video');
await page.selectOption('[data-testid="engine"]', 'eevee');
await page.fill('[data-testid="duration"]', '3');
await page.selectOption('[data-testid="resolution"]', '640x360');
await page.click('[data-testid="create-job"]');
await page.waitForSelector('[data-testid="job-item"]');

const killedAtFrames = await until(() => {
  const r = jobRow();
  return r && r.status === 'rendering' && r.frame >= 10 ? r.frame : 0;
}, 240_000, 'job render được ≥10 khung');
const jobId = jobRow().id;
const framesDir = join(dataDir, 'jobs', jobId, 'frames');
const before = readdirSync(framesDir).filter((f) => f.endsWith('.png'));
const firstMtime = statSync(join(framesDir, before[0])).mtimeMs;
log(`kill -9 app khi job ở khung ${killedAtFrames}, đã có ${before.length} khung PNG`);
await page.screenshot({ path: join(shots, '3-before-kill.png') });
process.kill(app.process().pid, 'SIGKILL');
await new Promise((r) => setTimeout(r, 1500));

// ---- Giai đoạn B ----
log('mở lại app đóng gói...');
app = await launch();
page = await app.firstWindow();
await page.waitForSelector('[data-testid="job-item"]', { timeout: 60_000 });
await page.screenshot({ path: join(shots, '4-after-restart.png') });
const final = await until(() => {
  const r = jobRow();
  return r && ['done', 'failed', 'needs_attention'].includes(r.status) ? r : null;
}, 900_000, 'job khôi phục chạy xong');
await page.waitForSelector('[data-testid="job-video"]', { timeout: 30_000 });
await page.screenshot({ path: join(shots, '5-done.png') });
const after = readdirSync(framesDir).filter((f) => f.endsWith('.png'));
const sameFirst = statSync(join(framesDir, before[0])).mtimeMs === firstMtime;
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,nb_frames', '-of', 'csv=p=0', final.output_path ?? ''], { encoding: 'utf8' });
const result = { final, framesAfter: after.length, framesBefore: before.length, firstFrameUntouched: sameFirst, probe: probe.stdout.trim() };
console.log(JSON.stringify(result, null, 2));
await app.close();
const ok = final.status === 'done' && final.failures === 1 && sameFirst && after.length === final.total_frames && probe.stdout.trim().startsWith('h264,yuv420p');
if (!ok) {
  console.error('E2E ĐÓNG GÓI: KHÔNG ĐẠT');
  process.exit(1);
}
console.log('E2E ĐÓNG GÓI: ĐẠT ->', shots);
