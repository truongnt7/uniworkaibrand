/* global document */
// Smoke test cho BẢN CÀI THỬ (app đã cài thật bằng installer NSIS trên Windows, hoặc thư mục linux-unpacked để thử trên Linux):
//   mở app đã cài -> banner tiếng Việt xin tải gói ffmpeg (nhẹ) -> tải THẬT qua mạng, kiểm sha256 + chữ ký manifest của bản thử
//   -> chọn ảnh (có 1 ảnh HEIC iPhone, tự đổi sang JPG) -> tạo video ảnh sang video -> lưu -> ffprobe đúng
//   -> đóng app, mở lại: bài nháp (tên, mẫu, ảnh, thông tin) còn nguyên.
// Không dùng APS_FFMPEG hay khóa dev: app đóng gói chạy đúng đường đi của khách.
// Dùng: node scripts/e2e-trial.mjs "<đường dẫn tới AI Product Studio.exe | thư mục linux-unpacked>"
//   Đầu ra (ảnh chụp, báo cáo JSON): APS_TRIAL_OUT (mặc định <tmp>/aps-trial-smoke).
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import jpeg from 'jpeg-js';
import { _electron as electron } from 'playwright-core';

const desktop = resolve(import.meta.dirname, '..');
const arg = process.argv[2] ?? process.env.APS_TRIAL_EXE ?? '';
let exe = arg;
if (arg && existsSync(arg) && statSync(arg).isDirectory()) exe = join(arg, process.platform === 'win32' ? 'AI Product Studio.exe' : 'ai-product-studio');
if (!exe || !existsSync(exe)) throw new Error(`không thấy app đã cài: "${arg}". Truyền đường dẫn exe hoặc thư mục giải nén.`);

const out = resolve(process.env.APS_TRIAL_OUT ?? join(tmpdir(), 'aps-trial-smoke'));
const dataDir = join(out, 'data');
const photoDir = join(out, 'photos');
const saveDir = join(out, 'saved');
const shotDir = join(out, 'shots');
rmSync(out, { recursive: true, force: true });
for (const d of [dataDir, photoDir, saveDir, shotDir]) mkdirSync(d, { recursive: true });

const heicSrc = join(desktop, 'tests', 'fixtures', 'heic', 'plain-320x240.heic');
const heic = join(photoDir, 'IMG_0001.HEIC');
copyFileSync(heicSrc, heic);
const jpgs = [];
for (let i = 0; i < 8; i++) {
  const w = 1080;
  const h = 1080;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      data[o] = (60 + i * 25 + (x >> 4)) & 255;
      data[o + 1] = (160 - i * 12 + (y >> 4)) & 255;
      data[o + 2] = (90 + i * 18) & 255;
      data[o + 3] = 255;
    }
  }
  const file = join(photoDir, `anh-san-pham-${i + 1}.jpg`);
  writeFileSync(file, jpeg.encode({ data, width: w, height: h }, 88).data);
  jpgs.push(file);
}
const logo = join(desktop, '..', '..', 'assets', 'samples', 'logo.png');

const BUSINESS = { businessName: 'Cửa hàng Hoa Mai', address: '12 Lê Lợi, Quận 1, TP.HCM', itemName: 'Son dưỡng môi tự nhiên', price: '199k', promo: 'Giảm 20% đến hết tuần', detail: 'Giao hàng toàn quốc' };
const DRAFT_NAME = 'Bài thử cài đặt';

const linuxFlags = process.platform === 'linux' ? ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] : [];
const launch = () =>
  electron.launch({
    executablePath: exe,
    args: linuxFlags,
    env: {
      ...process.env,
      APS_DATA_DIR: dataDir,
      APS_E2E: '1',
      APS_E2E_SAVE_DIR: saveDir,
      APS_E2E_FILES: JSON.stringify({ photo: [heic, ...jpgs], ...(existsSync(logo) ? { logo } : {}) }),
    },
  });

const report = { exe, platform: process.platform, steps: [], startedAt: new Date().toISOString() };
const errors = [];
const T = (id) => `[data-testid="${id}"]`;
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
let app;
let page;
let n = 0;
const shot = (name) => page.screenshot({ path: join(shotDir, `${String(++n).padStart(2, '0')}-${name}.png`) }).catch(() => undefined);
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
};
const finish = (ok) => {
  report.ok = ok;
  report.errors = errors;
  report.finishedAt = new Date().toISOString();
  writeFileSync(join(out, 'smoke-report.json'), JSON.stringify(report, null, 2));
};
const step = async (name, fn) => {
  const t = Date.now();
  try {
    await fn();
    report.steps.push({ name, ok: true, ms: Date.now() - t });
    console.log(`ok   ${name} (${Math.round((Date.now() - t) / 1000)}s)`);
  } catch (e) {
    report.steps.push({ name, ok: false, ms: Date.now() - t, error: String(e.stack ?? e) });
    console.error(`FAIL ${name}\n${e.stack ?? e}\n${errors.join('\n')}`);
    await shot(`FAIL-${name.replace(/\W+/g, '_')}`);
    finish(false);
    await app?.close().catch(() => undefined);
    process.exit(1);
  }
};
const text = (sel) => page.locator(sel).first().innerText();
const walk = (dir, acc = []) => {
  for (const f of existsSync(dir) ? readdirSync(dir, { withFileTypes: true }) : []) {
    const p = join(dir, f.name);
    if (f.isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
};

app = await launch();
page = await app.firstWindow();
watch(page);
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1750));

let slots = [];
await step('mở app đã cài: màn hình Tạo video bằng tiếng Việt, chưa có runtime', async () => {
  await page.waitForSelector(T('create-page'), { timeout: 60_000 });
  assert(/Tạo video giới thiệu/.test(await text(T('create-page'))), 'tiêu đề tiếng Việt');
  await page.click(T('industry-ban-hang-online'));
  await page.waitForSelector(`${T('template-bhol-gioi-thieu-san-pham')}[aria-checked="true"]`);
  slots = await page.locator('[data-testid^="photo-pick-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('photo-pick-', '')));
  assert(slots.length >= 1, 'mẫu phải có ô ảnh');
  await page.waitForSelector(T('runtime-banner'), { timeout: 20_000 });
  assert(/ffmpeg|thành phần|dựng video/i.test(await text(T('runtime-banner'))), 'banner tiếng Việt');
  await shot('moi-mo-app');
});

await step('tải gói ffmpeg (chỉ ffmpeg, không Blender) với tiến độ tiếng Việt', async () => {
  await page.click(T('runtime-install'));
  await page.waitForSelector(T('runtime-progress'), { timeout: 30_000 });
  const line = await text(T('runtime-progress'));
  assert(/Đang|tải|kiểm tra|giải nén|Tải/.test(line), `tiến độ phải là tiếng Việt: ${line}`);
  await shot('dang-tai-ffmpeg');
  await page.waitForSelector(T('runtime-banner'), { state: 'detached', timeout: 15 * 60_000 });
  const runtimeFiles = walk(join(dataDir, 'runtime'));
  assert(runtimeFiles.some((f) => /ffmpeg(\.exe)?$/.test(f)), 'ffmpeg đã được giải nén vào thư mục runtime');
  assert(!runtimeFiles.some((f) => /blender(\.exe)?$/i.test(f)), 'gói ffmpeg không được kéo theo Blender');
  await shot('da-cai-ffmpeg');
});

const BUSINESS_KEYS = Object.keys(BUSINESS);
await step('chọn ảnh (có ảnh HEIC), điền thông tin, đặt tên bài', async () => {
  await page.fill(T('draft-name'), DRAFT_NAME);
  for (const key of BUSINESS_KEYS) if ((await page.locator(T(`field-${key}`)).count()) > 0) await page.fill(T(`field-${key}`), BUSINESS[key]);
  await page.fill(T('field-phone'), '0901234567');
  await page.press(T('field-phone'), 'Tab');
  await page.click(T(`photo-pick-${slots[0]}`));
  await page.waitForSelector(T(`photo-thumb-${slots[0]}`), { timeout: 60_000 });
  for (const slot of slots.slice(1)) await page.click(T(`photo-pick-${slot}`));
  if ((await page.locator(T('logo-pick')).count()) > 0 && existsSync(logo)) {
    await page.click(T('logo-pick'));
    await page.waitForSelector(T('logo-remove'));
  }
  const converted = walk(join(dataDir, 'uploads')).filter((f) => /\.jpe?g$/i.test(f));
  assert(converted.length === 1, `ảnh HEIC phải được đổi thành đúng 1 JPG trong thư mục dữ liệu, thấy: ${converted}`);
  assert(statSync(converted[0]).size > 1000, 'JPG đổi từ HEIC không được rỗng');
  await page.waitForFunction(() => !document.querySelector('[data-testid="create-button"]').disabled, null, { timeout: 30_000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="draft-status"]')?.getAttribute('data-state') === 'saved', null, { timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid^="field-"][data-testid$="-error"]'), null, { timeout: 10_000 });
  await shot('da-dien-du');
});

let probeTool;
await step('tạo video ảnh sang video, lưu, ffprobe', async () => {
  await page.click(T('create-button'));
  await page.waitForSelector(`${T('preview-panel')}[data-state="done"]`, { timeout: 5 * 60_000 });
  await page.waitForSelector(T('preview-video'));
  await shot('xem-truoc');
  await page.click(T('save-button'));
  await page.waitForSelector(T('save-status'), { timeout: 5 * 60_000 });
  const files = readdirSync(saveDir).filter((f) => f.endsWith('.mp4'));
  assert(files.length === 1, `phải lưu đúng 1 tệp mp4, thấy: ${files}`);
  const saved = join(saveDir, files[0]);
  const exeName = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';
  probeTool = walk(join(dataDir, 'runtime')).find((f) => f.endsWith(`${process.platform === 'win32' ? '\\' : '/'}${exeName}`)) ?? 'ffprobe';
  const r = spawnSync(probeTool, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=duration', '-of', 'json', saved], { encoding: 'utf8' });
  assert(r.status === 0, `ffprobe (${probeTool}) lỗi: ${r.stderr || r.error}`);
  const j = JSON.parse(r.stdout);
  const v = j.streams[0];
  const duration = Number(j.format.duration);
  report.video = { ...v, duration, file: saved, ffprobe: probeTool };
  assert(v.codec_name === 'h264' && v.pix_fmt === 'yuv420p', `codec: ${JSON.stringify(v)}`);
  assert(v.width === 1080 && v.height === 1920, `kích thước: ${v.width}x${v.height}`);
  assert(duration > 5, `thời lượng: ${duration}`);
});

await step('đóng app, mở lại: bài nháp còn nguyên (tên, mẫu, ảnh, thông tin)', async () => {
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  watch(page);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1750));
  await page.waitForSelector(T('create-page'), { timeout: 60_000 });
  await page.waitForFunction((name) => document.querySelector('[data-testid="draft-name"]')?.value === name, DRAFT_NAME, { timeout: 20_000 });
  await page.waitForSelector(`${T('template-bhol-gioi-thieu-san-pham')}[aria-checked="true"]`);
  for (const slot of slots) await page.waitForSelector(T(`photo-thumb-${slot}`), { timeout: 20_000 });
  assert((await page.inputValue(T('field-businessName'))) === BUSINESS.businessName, 'tên cửa hàng phải còn');
  assert((await page.locator(T('draft-missing')).count()) === 0, 'không được báo thiếu ảnh');
  assert((await page.locator(T('runtime-banner')).count()) === 0, 'runtime đã cài thì không hiện banner tải lại');
  await shot('mo-lai-con-nguyen');
});

const bad = errors.filter((e) => !/Autofill|DevTools/.test(e));
await app.close();
if (bad.length) {
  console.error(`Có lỗi console/pageerror:\n${bad.join('\n')}`);
  finish(false);
  process.exit(1);
}
finish(true);
console.log(`SMOKE BẢN THỬ: ĐẠT -> ${out}`);
