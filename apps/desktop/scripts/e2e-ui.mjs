/* global document, location, HTMLInputElement */
// E2E smoke cho UI shell: mở Electron thật (dưới Xvfb), đi qua từng màn hình, kiểm tra hành vi chính và chụp screenshot.
// Nút Xuất của Studio ảnh đi qua IPC/job queue thật; Blender được thay bằng tests/fixtures/fake-blender.mjs
// (cùng giao thức job.json -> JSON-lines) nên không cần cài runtime.
// Dùng: xvfb-run -a pnpm --filter @aps/desktop e2e:ui   (cần `pnpm build` trước)
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { _electron as electron } from 'playwright-core';

const desktop = resolve(import.meta.dirname, '..');
const repo = resolve(desktop, '..', '..');
const dataDir = resolve(process.env.APS_E2E_DATA ?? '/tmp/aps-e2e-ui-data');
const shotDir = resolve(process.env.APS_E2E_SHOTS ?? '/tmp/aps-e2e-ui-shots');
rmSync(dataDir, { recursive: true, force: true });
rmSync(shotDir, { recursive: true, force: true });
mkdirSync(dataDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });

const fakeBlender = join(dataDir, 'blender');
writeFileSync(fakeBlender, `#!/bin/sh\nexec "${process.execPath}" "${join(desktop, 'tests/fixtures/fake-blender.mjs')}" "$@"\n`);
chmodSync(fakeBlender, 0o755);
if (!existsSync(join(desktop, 'out/renderer/index.html'))) throw new Error('Chưa build: chạy `pnpm build` trước');

const app = await electron.launch({
  args: [desktop, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  env: {
    ...process.env,
    APS_DATA_DIR: dataDir,
    APS_BLENDER_BIN: fakeBlender,
    FAKE_DELAY_MS: '40',
    APS_E2E_FILES: JSON.stringify({ glb: join(repo, 'assets/samples/serum-bottle.glb'), image: join(repo, 'assets/samples/label.png') }),
  },
});
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.setContentSize(1440, 900));
await page.waitForTimeout(300);
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

const step = async (name, fn) => {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    await page.screenshot({ path: join(shotDir, `FAIL-${name.replace(/\W+/g, '_')}.png`) }).catch(() => undefined);
    console.error(`FAIL ${name}\n${e.stack ?? e}`);
    await app.close();
    process.exit(1);
  }
};
const T = (id) => `[data-testid="${id}"]`;
const shot = (name) => page.screenshot({ path: join(shotDir, `${name}.png`) });
const text = (sel) => page.locator(sel).first().innerText();
const expectText = async (sel, re) => {
  await page.waitForFunction(([s, src]) => new RegExp(src).test(document.querySelector(s)?.textContent ?? ''), [sel, re.source], { timeout: 10_000 });
};
const goto = async (key) => {
  await page.click(T(`nav-${key}`));
  await page.waitForTimeout(250);
};

await step('shell: sidebar và workspace switcher', async () => {
  await page.waitForSelector(T('sidebar'));
  for (const k of ['create', 'overview', 'products', 'studio', 'templates', 'library', 'publish']) await page.waitForSelector(T(`nav-${k}`));
  await page.click(T('nav-overview'));
  await page.waitForSelector(T('overview'));
  if (!/Tổng quan/.test(await text(T('nav-overview')))) throw new Error('i18n vi mặc định');
  await shot('01-overview');
  await page.click(T('workspace-switcher'));
  await page.waitForSelector(T('workspace-ws-botanic'));
  await shot('00-workspace-switcher');
  await page.keyboard.press('Escape');
});

await step('sản phẩm: lưới, tìm kiếm, danh sách, chi tiết', async () => {
  await goto('products');
  await page.waitForSelector(T('product-card'));
  if ((await page.locator(T('product-card')).count()) !== 6) throw new Error('trang đầu phải có 6 sản phẩm');
  await shot('02-products');
  await page.click(T('tab-imageOnly'));
  await page.waitForTimeout(300);
  await page.click(T('tab-all'));
  await page.fill(T('product-search'), 'serum');
  await page.waitForTimeout(500);
  if ((await page.locator(T('product-card')).count()) < 1) throw new Error('tìm kiếm serum');
  await page.click(T('view-list'));
  await shot('02b-products-list');
  await page.fill(T('product-search'), '');
  await page.click(T('product-card') + ' >> nth=0');
  await page.waitForSelector(T('detail-name'));
});

await step('kho mẫu: lọc, xem trước, lưu mẫu, dùng mẫu này', async () => {
  await goto('templates');
  await page.waitForSelector(T('template-card'));
  await shot('03-templates');
  await page.click(T('template-card') + ' >> nth=2');
  await page.waitForSelector(T('preview-name'));
  await page.click(T('save-template'));
  await page.click(T('tab-mine'));
  await page.waitForSelector(T('template-card'));
  await page.click(T('use-template'));
  await page.waitForSelector(T('studio'));
  await shot('03b-studio-from-template');
});

await step('studio video 3D: bố cục, timeline, easing, thành phần, Đạo diễn AI', async () => {
  await page.evaluate(() => (location.hash = '#/studio?product=bot-001&mode=video'));
  await page.waitForSelector(T('video-canvas'));
  await page.waitForSelector(T('toast'), { state: 'detached', timeout: 10_000 }).catch(() => undefined);
  await shot('05-studio-video');
  if ((await page.locator(T('clip')).count()) < 3) throw new Error('timeline thiếu clip');
  await page.locator(T('clip')).nth(2).click();
  await page.fill(T('clip-end'), '12');
  await page.selectOption(T('clip-ease'), 'linear');
  const end = await page.locator(T('clip')).nth(2).getAttribute('data-end');
  if (end !== '12') throw new Error(`clip-end=${end}`);
  await page.click(T('toggle-product'));
  await page.click(T('toggle-product'));
  await page.click(T('aspect-9:16'));
  await page.click(T('aspect-16:9'));
  await page.fill(T('director-input'), 'Xoay chai chậm 10 giây, kết thúc bằng logo');
  await page.click(T('director-send'));
  await expectText(T('time-readout'), /\/ 00:10/);
  await page.locator(T('scrubber')).evaluate((el) => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(el, '6');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await shot('05b-studio-video-director');
});

await step('studio ảnh: preset, undo/redo, xuất qua IPC job queue thật', async () => {
  await page.evaluate(() => (location.hash = '#/studio?product=bot-001&mode=image'));
  await page.waitForSelector(T('image-canvas'));
  await page.waitForSelector(T('toast'), { state: 'detached', timeout: 10_000 }).catch(() => undefined);
  await page.click(T('preset-minimal'));
  await page.click(T('undo'));
  if ((await page.locator(T('image-canvas')).getAttribute('data-preset')) !== 'nature') throw new Error('undo preset');
  await shot('04-studio-image');
  await page.click(T('export-button'));
  await page.waitForSelector(T('export-status'));
  const mode = await page.locator(T('export-status')).getAttribute('data-mode');
  if (mode !== 'queue') throw new Error(`mong đợi export qua queue, nhận ${mode}`);
  await page.waitForSelector(`${T('export-status')}[data-status="done"]`, { timeout: 60_000 });
  await shot('04b-studio-image-exported');
  await page.click(T('view-in-library'));
});

await step('thư viện: Đang xuất %, panel chi tiết, tải xuống', async () => {
  await page.waitForSelector(T('library-card'));
  await page.waitForSelector(T('detail-file-name'));
  await shot('06-library');
  await page.click(T('tab-video'));
  await page.waitForSelector(`${T('library-card')}[data-status="exporting"]`);
  await page.waitForSelector(T('exporting-badge'));
  await shot('06c-library-exporting');
  await page.click(T('tab-all'));
  await page.locator(`${T('library-card')}[data-status="done"]`).first().click();
  await page.waitForSelector(T('download'));
  const dl = page.waitForEvent('download', { timeout: 5_000 }).catch(() => null);
  await page.click(T('download'));
  await dl;
  await page.click(T('folder-new'));
  await shot('06b-library-new-folder');
  await page.keyboard.press('Escape');
});

await step('chuẩn bị đăng thủ công: caption, hashtag, xem trước, sao chép', async () => {
  await goto('publish');
  await page.waitForFunction(() => document.querySelector('[data-testid="caption-input"]')?.value);
  await page.fill(T('hashtag-input'), 'e2e');
  await page.keyboard.press('Enter');
  await expectText(T('hashtags'), /#e2e/);
  await page.click(T('copy-caption'));
  await page.waitForSelector(T('toast'));
  await shot('07-publish');
});

await step('PoC Console vẫn hoạt động (#/poc)', async () => {
  await page.click(T('nav-poc'));
  await page.waitForSelector(T('job-form'));
  await shot('08-poc-console');
});

await step('i18n: chuyển sang English rồi quay lại tiếng Việt', async () => {
  await goto('products');
  await page.click(T('user-menu'));
  await page.click(T('locale-en'));
  await expectText(T('nav-products'), /Products/);
  await shot('09-products-en');
  await page.click(T('user-menu'));
  await page.click(T('locale-vi'));
  await expectText(T('nav-products'), /Sản phẩm/);
});

if (errors.length) {
  console.error('Lỗi renderer:\n' + errors.join('\n'));
  await app.close();
  process.exit(1);
}
console.log('E2E UI OK ->', shotDir);
await app.close();
