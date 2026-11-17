/* global document, getComputedStyle */
// E2E luồng "Tạo video" bằng Electron thật (dưới Xvfb), KHÔNG giả lập dịch vụ nào:
// giao diện -> IPC có kiểu -> hàng đợi SQLite -> SlideshowRunner -> ffmpeg LGPL thật -> mp4 -> asset:// -> <video> -> hộp thoại lưu.
// Hộp thoại của hệ điều hành không điều khiển được nên main nhận các biến APS_E2E_FILES / APS_E2E_SAVE_DIR (chỉ khi chạy từ mã nguồn).
// Dùng: xvfb-run -a -s "-screen 0 1600x1800x24" pnpm --filter @aps/desktop e2e:create
//   (cần `pnpm build` trước và một ffmpeg LGPL: APS_FFMPEG, hoặc .cache/ffmpeg/*/bin/ffmpeg do tools/ tải về)
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const desktop = resolve(import.meta.dirname, '..');
const repo = resolve(desktop, '..', '..');
const root = resolve(process.env.APS_E2E_DATA ?? '/tmp/aps-e2e-create');
const dataDir = join(root, 'data');
const photoDir = join(root, 'photos');
const saveDir = join(root, 'saved');
const shotDir = resolve(process.env.APS_E2E_SHOTS ?? join(root, 'shots'));
for (const d of [root]) rmSync(d, { recursive: true, force: true });
for (const d of [dataDir, photoDir, saveDir, shotDir]) mkdirSync(d, { recursive: true });
if (!existsSync(join(desktop, 'out/renderer/index.html'))) throw new Error('Chưa build: chạy `pnpm build` trước');

const cacheDir = join(repo, '.cache', 'ffmpeg');
const ffmpeg =
  process.env.APS_FFMPEG ??
  (existsSync(cacheDir) ? readdirSync(cacheDir).map((v) => join(cacheDir, v, 'bin', 'ffmpeg')).find((p) => existsSync(p)) : undefined);
if (!ffmpeg) throw new Error('Không có ffmpeg LGPL: đặt APS_FFMPEG hoặc tải bằng tools/ trước');
const ffprobe = join(ffmpeg, '..', 'ffprobe');
const font = join(desktop, 'resources/fonts/BeVietnamPro-Bold.ttf');

// Ảnh thật (1200x1200 JPG) có màu khác nhau và chữ tiếng Việt, để nhìn thấy ngay ảnh nào vào chỗ nào.
const colors = ['0x2f6f5e', '0xb4543a', '0x3a5ab4', '0x8a6d1d', '0x6a3a8a', '0x1d7a8a', '0x8a1d4b', '0x4b8a1d'];
const names = [];
colors.forEach((c, i) => {
  const file = join(photoDir, `anh-san-pham-${i + 1}.jpg`);
  const draw = `drawtext=fontfile=${font}:text='Ảnh sản phẩm ${i + 1}':fontcolor=white:fontsize=64:x=(w-text_w)/2:y=(h-text_h)/2`;
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${c}:s=1200x1200`, '-vf', draw, '-frames:v', '1', '-q:v', '3', file]);
  if (r.status !== 0) throw new Error(`Không tạo được ảnh mẫu: ${r.stderr}`);
  names.push(file);
});
const heic = join(photoDir, 'anh-iphone.HEIC');
writeFileSync(heic, Buffer.from('khong-phai-anh-that'));
const logo = join(root, 'logo.png');
copyFileSync(join(repo, 'assets/samples/logo.png'), logo);

const BUSINESS = { businessName: 'Cửa hàng Hoa Mai', address: '12 Lê Lợi, Quận 1, TP.HCM', itemName: 'Son dưỡng môi tự nhiên', price: '199k', promo: 'Giảm 20% đến hết tuần', detail: 'Giao hàng toàn quốc' };
const PHONE_OK = '0901234567';

const launch = () =>
  electron.launch({
    args: [desktop, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    env: {
      ...process.env,
      APS_DATA_DIR: dataDir,
      APS_FFMPEG: ffmpeg,
      APS_E2E_SAVE_DIR: saveDir,
      APS_E2E_FILES: JSON.stringify({ photo: [heic, ...names], logo }),
    },
  });

let app = await launch();
let page = await app.firstWindow();
const errors = [];
const watch = (p) => {
  p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  p.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
};
watch(page);
const resize = async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 1750));
  await page.waitForTimeout(300);
};
await resize();

const T = (id) => `[data-testid="${id}"]`;
let n = 0;
const shot = async (name) => {
  const file = join(shotDir, `${String(++n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  return file;
};
const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    await page.screenshot({ path: join(shotDir, `FAIL-${name.replace(/\W+/g, '_')}.png`) }).catch(() => undefined);
    console.error(`FAIL ${name}\n${e.stack ?? e}`);
    console.error(errors.join('\n'));
    await app.close().catch(() => undefined);
    process.exit(1);
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
const waitState = (state, timeout = 60_000) => page.waitForSelector(`${T('preview-panel')}[data-state="${state}"]`, { timeout });
const text = (sel) => page.locator(sel).first().innerText();
const probe = (file) => {
  const r = spawnSync(ffprobe, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  assert(r.status === 0, `ffprobe lỗi: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  return { ...j.streams[0], duration: Number(j.format.duration) };
};

await step('màn hình đầu tiên: trạng thái rỗng, tiếng Việt, đúng phông', async () => {
  await page.waitForSelector(T('create-page'));
  assert(/Tạo video giới thiệu/.test(await text(T('create-page'))), 'tiêu đề tiếng Việt');
  assert(/Chọn ngành của bạn để bắt đầu/.test(await text(T('empty-hint'))), 'gợi ý trạng thái rỗng');
  assert(await page.locator(T('create-button')).isDisabled(), 'nút Tạo video phải tắt khi chưa đủ');
  assert(await page.locator(T('target-cloud')).isDisabled(), 'Cloud phải là "sắp có", không chọn được');
  const font = await page.evaluate(async () => {
    await document.fonts.ready;
    return {
      family: getComputedStyle(document.querySelector('[data-testid="create-page"]')).fontFamily,
      loaded: document.fonts.check('600 16px "Be Vietnam Pro"') && [...document.fonts].some((f) => f.family.includes('Be Vietnam Pro') && f.status === 'loaded'),
    };
  });
  assert(/Be Vietnam Pro/.test(font.family) && font.loaded, `phông Be Vietnam Pro chưa được nạp: ${JSON.stringify(font)}`);
  await shot('trang-thai-rong');
});

await step('chọn ngành và mẫu', async () => {
  await page.click(T('industry-ban-hang-online'));
  await page.waitForSelector(`${T('template-bhol-gioi-thieu-san-pham')}[aria-checked="true"]`);
  assert(/Còn thiếu:/.test(await text(T('missing-list'))), 'phải liệt kê phần còn thiếu');
  await shot('chon-nganh-mau');
  await page.click(T('template-bhol-khuyen-mai'));
  await page.waitForSelector(`${T('template-bhol-khuyen-mai')}[aria-checked="true"]`);
  await page.click(T('template-bhol-gioi-thieu-san-pham'));
});

await step('lỗi dễ hiểu: SĐT sai, ảnh HEIC, thiếu thông tin', async () => {
  await page.fill(T('field-businessName'), BUSINESS.businessName);
  await page.fill(T('field-phone'), '12345');
  await page.press(T('field-phone'), 'Tab');
  await page.waitForSelector(T('field-phone-error'));
  assert(/Số điện thoại chưa đúng/.test(await text(T('field-phone-error'))), 'lỗi SĐT');
  const firstSlot = (await page.locator('[data-testid^="photo-pick-"]').first().getAttribute('data-testid')).replace('photo-pick-', '');
  await page.click(T(`photo-pick-${firstSlot}`));
  await page.waitForSelector(T(`photo-error-${firstSlot}`));
  assert(/HEIC/.test(await text(T(`photo-error-${firstSlot}`))), 'lỗi HEIC');
  assert(await page.locator(T('create-button')).isDisabled(), 'không được tạo khi còn lỗi');
  await shot('loi-sdt-va-anh-heic');
});

const slots = await page.locator('[data-testid^="photo-pick-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid').replace('photo-pick-', '')));

await step('điền đủ thông tin, đổi ảnh HEIC, thêm logo -> sẵn sàng tạo', async () => {
  await page.fill(T('field-phone'), PHONE_OK);
  await page.press(T('field-phone'), 'Tab');
  await page.waitForFunction(() => document.querySelector('[data-testid="field-phone"]').value === '0901 234 567');
  for (const [key, value] of Object.entries(BUSINESS)) if ((await page.locator(T(`field-${key}`)).count()) > 0) await page.fill(T(`field-${key}`), value);
  for (const slot of slots) await page.click(T(`photo-pick-${slot}`));
  await page.waitForSelector(T(`photo-thumb-${slots[0]}`));
  await page.click(T('logo-pick'));
  await page.waitForSelector(T('logo-remove'));
  await page.waitForFunction(() => !document.querySelector('[data-testid="create-button"]').disabled, null, { timeout: 15_000 });
  assert((await page.locator(T('missing-list')).count()) === 0, 'không còn mục thiếu');
  await shot('da-dien-du-san-sang');
});

await step('tạo -> đang chạy -> hủy (có nút Thử lại, dữ liệu còn nguyên)', async () => {
  await page.click(T('create-button'));
  await waitState('running', 15_000);
  await shot('dang-chay');
  await page.click(T('preview-cancel'));
  await waitState('canceled', 30_000);
  assert(/Thông tin bạn nhập vẫn còn nguyên/.test(await text(T('preview-canceled'))), 'thông báo hủy');
  assert((await page.inputValue(T('field-businessName'))) === BUSINESS.businessName, 'dữ liệu nhập phải còn');
  await page.waitForSelector(`${T('queue-item')}[data-status="canceled"]`);
  await shot('da-huy');
});

await step('lỗi thật: ảnh bị xóa khỏi máy -> báo lỗi dễ hiểu -> trả ảnh lại -> Thử lại chạy xong', async () => {
  const gone = names[0];
  renameSync(gone, `${gone}.bak`);
  await page.click(T('preview-retry'));
  await waitState('failed', 30_000);
  const msg = await text(T('preview-error'));
  assert(/Chưa tạo được video/.test(msg) && /ảnh/i.test(msg) && !/SLIDESHOW_/.test(msg), `thông báo lỗi chưa thân thiện: ${msg}`);
  await shot('loi-thieu-anh');
  renameSync(`${gone}.bak`, gone);
  await page.click(T('preview-retry'));
  await waitState('done', 60_000);
});

let previewJobId;
await step('xem trước: mp4 phát được qua asset://', async () => {
  const info = await page.evaluate(async () => {
    const v = document.querySelector('[data-testid="preview-video"]');
    if (!v) return null;
    if (v.readyState < 2) await new Promise((res, rej) => { v.addEventListener('loadeddata', res, { once: true }); v.addEventListener('error', () => rej(new Error('video error')), { once: true }); setTimeout(() => rej(new Error('video timeout')), 15000); });
    return { src: v.currentSrc, w: v.videoWidth, h: v.videoHeight, d: v.duration };
  });
  assert(info && info.w > 0 && info.h > 0 && info.d > 3, `video không phát được: ${JSON.stringify(info)}`);
  assert(/^asset:\/\/job\//.test(info.src), 'phải phát qua asset://');
  previewJobId = info.src.split('/')[3];
  await page.evaluate(() => { const v = document.querySelector('[data-testid="preview-video"]'); v.currentTime = 1.2; });
  await page.waitForTimeout(500);
  await shot('xem-truoc-xong');
});

await step('chữ đăng kèm: 3 kênh, sửa, sao chép vào clipboard thật', async () => {
  for (const ch of ['facebook', 'zalo', 'tiktok']) await page.waitForSelector(T(`caption-tab-${ch}`));
  await page.waitForFunction(() => document.querySelector('[data-testid="caption-text"]')?.value.includes('0901 234 567'));
  await page.click(T('caption-tab-zalo'));
  await page.click(T('caption-copy'));
  await page.waitForSelector(T('toast'));
  const clip = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert(clip.includes(BUSINESS.itemName) && clip.includes('0901 234 567'), `clipboard: ${clip}`);
  assert(!/#/.test(clip), 'Zalo không dùng hashtag');
  await page.click(T('caption-tab-facebook'));
  await page.click(T('caption-copy'));
  const fb = await app.evaluate(({ clipboard }) => clipboard.readText());
  assert(/#CửaHàngHoaMai/.test(fb), `Facebook phải có hashtag thương hiệu: ${fb}`);
  await shot('chu-dang-kem-da-sao-chep');
});

let savedFile;
await step('lưu video: dựng bản đẹp 1080p, lưu qua hộp thoại, ffprobe đúng', async () => {
  await page.click(T('save-button'));
  await page.waitForSelector(T('save-status'), { timeout: 90_000 });
  const files = readdirSync(saveDir).filter((f) => f.endsWith('.mp4'));
  assert(files.length === 1, `phải lưu đúng 1 tệp mp4, thấy: ${files}`);
  savedFile = join(saveDir, files[0]);
  const v = probe(savedFile);
  assert(v.codec_name === 'h264' && v.pix_fmt === 'yuv420p', `codec: ${JSON.stringify(v)}`);
  assert(v.width === 1080 && v.height === 1920, `kích thước bản đẹp: ${v.width}x${v.height}`);
  assert(v.duration > 5, `thời lượng: ${v.duration}`);
  await shot('da-luu-video');
});

await step('khung hình của video có chữ tiếng Việt có dấu', async () => {
  const frame = join(shotDir, 'khung-hinh-video-1080p.png');
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '2', '-i', savedFile, '-frames:v', '1', frame]);
  assert(r.status === 0 && existsSync(frame), 'không trích được khung hình');
});

await step('hàng đợi: xem, trạng thái, xóa', async () => {
  const items = await page.locator(T('queue-item')).count();
  assert(items >= 2, `hàng đợi phải có ít nhất 2 video, thấy ${items}`);
  assert((await page.locator(`${T('queue-item')}[data-status="done"]`).count()) >= 2, 'phải có 2 video xong');
  await page.locator(`${T('queue-item')}[data-status="done"] ${T('queue-view')}`).last().click();
  await page.waitForSelector(T('preview-video'));
  await shot('hang-doi');
  assert(previewJobId, 'có id job xem trước');
});

await step('video 3D (nâng cao): mở rộng, chặn khi chưa cài thành phần 3D', async () => {
  await page.click(`${T('d3-section')} summary`);
  assert(/Cần cài thành phần dựng 3D/.test(await text(T('d3-section'))), 'chưa cài Blender thì phải hướng dẫn cài');
  assert(await page.locator(T('d3-create')).isDisabled(), 'không cho tạo video 3D khi chưa cài thành phần 3D');
  await page.fill(T('d3-prompt'), 'Xoay chai chậm, camera tiến gần, cuối video hiện logo.');
  await shot('video-3d-nang-cao');
});

await step('ghi nhớ thông tin cơ sở sau khi mở lại app', async () => {
  await app.close();
  app = await launch();
  page = await app.firstWindow();
  watch(page);
  await resize();
  await page.waitForSelector(T('create-page'));
  await page.waitForFunction(() => document.querySelector('[data-testid="field-businessName"]')?.value === 'Cửa hàng Hoa Mai', null, { timeout: 15_000 });
  assert((await page.inputValue(T('field-phone'))) === '0901 234 567', 'SĐT phải được nhớ');
  assert((await page.inputValue(T('field-address'))) === BUSINESS.address, 'địa chỉ phải được nhớ');
  await page.waitForSelector(T('logo-remove'));
  await page.waitForSelector(`${T('template-bhol-gioi-thieu-san-pham')}[aria-checked="true"]`);
  await page.waitForSelector(`${T('queue-item')}[data-status="done"]`);
  await shot('mo-lai-app-da-nho');
  await page.click(T('forget-profile'));
  await page.waitForFunction(() => document.querySelector('[data-testid="industry-ban-hang-online"]')?.getAttribute('aria-checked') === 'false');
  await shot('da-xoa-thong-tin');
});

const bad = errors.filter((e) => !/Autofill|DevTools/.test(e));
if (bad.length) {
  console.error(`Có lỗi console/pageerror:\n${bad.join('\n')}`);
  await app.close();
  process.exit(1);
}
await app.close();
console.log(`E2E tạo video OK. Ảnh chụp: ${shotDir}`);
