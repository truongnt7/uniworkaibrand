// E2E: Electron thật (dưới Xvfb) -> IPC `jobs:createFromPrompt` -> main -> orchestrator (Đạo diễn AI rule-based offline)
// -> job.json v2 -> Blender 4.5 thật (EEVEE) -> ffmpeg LGPL -> mp4; kiểm bằng ffprobe.
// Dùng: xvfb-run -a env APS_BLENDER_BIN=<blender> APS_FFMPEG=<ffmpeg LGPL> pnpm --filter @aps/desktop e2e:timeline   (cần `pnpm build` trước)
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const repo = resolve(import.meta.dirname, '..', '..', '..');
const dataDir = resolve(process.env.APS_E2E_DATA ?? '/tmp/aps-e2e-timeline-data');
const blender = process.env.APS_BLENDER_BIN;
const ffmpeg = process.env.APS_FFMPEG;
if (!blender || !ffmpeg) throw new Error('Cần APS_BLENDER_BIN và APS_FFMPEG (ffmpeg LGPL: node tools/ffmpeg/fetch-lgpl.mjs)');
rmSync(dataDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });

const app = await electron.launch({
  args: [resolve(import.meta.dirname, '..'), '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  env: { ...process.env, APS_DATA_DIR: dataDir, APS_AI_MODE: 'rules' },
});
const page = await app.firstWindow();
page.on('pageerror', (e) => console.error('[renderer error]', e.message));
await page.waitForLoadState('domcontentloaded');

const samples = join(repo, 'assets', 'samples');
const res = await page.evaluate(
  (p) =>
    globalThis.aps.invoke('jobs:createFromPrompt', {
      prompt: 'Video ngang 2 giây, chai xoay một vòng, camera tiến gần rồi quay quanh 60 độ, cuối video hiện logo ở giữa',
      product: { glbPath: p.glb, label: { imagePath: p.label, mode: 'cylinder' } },
      logoPath: p.logo,
      render: { shortSide: 144, fps: 15, samples: 4 },
    }),
  { glb: join(samples, 'serum-bottle.glb'), label: join(samples, 'label.png'), logo: join(samples, 'logo.png') },
);
console.log('Đạo diễn:', res.director.source, res.director.warnings);

let job = res.job;
const deadline = Date.now() + 10 * 60_000;
while (Date.now() < deadline) {
  const list = await page.evaluate(() => globalThis.aps.invoke('jobs:list'));
  job = list.find((j) => j.id === res.job.id) ?? job;
  if (['done', 'failed', 'needs_attention', 'canceled'].includes(job.status)) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await app.close();
if (job.status !== 'done') throw new Error(`job ${job.status}: ${job.errorCode} ${job.errorMessage}`);

const probe = spawnSync(join(dirname(ffmpeg), 'ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt,nb_frames', '-of', 'csv=p=0', job.outputPath]);
const info = probe.stdout.toString().trim();
const jobJson = JSON.parse(readFileSync(join(job.workDir, 'job.json'), 'utf8'));
if (jobJson.version !== 2 || !existsSync(job.outputPath) || info !== 'h264,256,144,yuv420p,30') throw new Error(`kết quả không đúng: v${jobJson.version} ${info}`);
console.log(`E2E OK: ${job.outputPath} (${info}), job.json v${jobJson.version}, ${jobJson.frames.total} khung`);
