import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, truncateSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { decode as decodeJpeg } from 'jpeg-js';
import { build } from 'esbuild';
import { HEIC_EXTENSIONS, convertHeicBuffer, convertHeicFile, looksLikeHeic, resizeRgba } from '../src/orchestrator/photos/heic.js';
import { PhotoPreparer, workerConverter } from '../src/orchestrator/photos/prepare.js';

const fixtures = resolve(import.meta.dirname, 'fixtures', 'heic');
const PLAIN = join(fixtures, 'plain-320x240.heic');
const IROT = join(fixtures, 'irot90-320x240.heic');
const WIDE = join(fixtures, 'wide-4200x600.heic');

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-heic-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function readJpeg(path: string) {
  const bytes = readFileSync(path);
  expect([bytes[0], bytes[1]]).toEqual([0xff, 0xd8]);
  const img = decodeJpeg(bytes, { useTArray: true });
  const px = (x: number, y: number) => Array.from(img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3));
  return { width: img.width, height: img.height, px };
}
const near = (rgb: number[], want: number[], tol = 40) => rgb.every((v, i) => Math.abs(v - want[i]!) <= tol);

describe('chuyển HEIC/HEIF sang JPG', () => {
  it('nhận diện bằng nội dung (ftyp), không chỉ theo đuôi tệp', () => {
    expect(looksLikeHeic(readFileSync(PLAIN).subarray(0, 64))).toBe(true);
    expect(looksLikeHeic(readFileSync(IROT).subarray(0, 64))).toBe(true);
    expect(looksLikeHeic(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]))).toBe(false);
    expect(looksLikeHeic(Buffer.from('short'))).toBe(false);
    expect([...HEIC_EXTENSIONS].sort()).toEqual(['.heic', '.heif', '.hif']);
  });

  it('giải mã ảnh thật: ra JPG đúng kích thước và màu (góc trên-trái đỏ, dưới-phải xanh lá)', async () => {
    const out = join(tmp(), 'plain.jpg');
    const r = await convertHeicFile(PLAIN, out);
    expect(r).toEqual({ width: 320, height: 240 });
    const jpg = readJpeg(out);
    expect([jpg.width, jpg.height]).toEqual([320, 240]);
    expect(near(jpg.px(10, 10), [220, 40, 40])).toBe(true);
    expect(near(jpg.px(310, 230), [40, 200, 60])).toBe(true);
    expect(near(jpg.px(10, 230), [30, 60, 200])).toBe(true);
    expect(existsSync(`${out}.part`)).toBe(false);
  });

  it('ảnh có hộp irot (iPhone chụp dọc) ra đúng chiều: 240x320, đỏ ở góc dưới-trái', async () => {
    const out = join(tmp(), 'irot.jpg');
    expect(await convertHeicFile(IROT, out)).toEqual({ width: 240, height: 320 });
    const jpg = readJpeg(out);
    expect([jpg.width, jpg.height]).toEqual([240, 320]);
    expect(near(jpg.px(10, 310), [220, 40, 40])).toBe(true);
    expect(near(jpg.px(230, 10), [40, 200, 60])).toBe(true);
  });

  it('ảnh lớn bị thu nhỏ cạnh dài về tối đa 3840 giữ tỉ lệ', async () => {
    const out = await convertHeicBuffer(readFileSync(WIDE));
    expect([out.width, out.height]).toEqual([3840, 549]);
    const small = await convertHeicBuffer(readFileSync(WIDE), { maxSide: 1000 });
    expect([small.width, small.height]).toEqual([1000, 143]);
  });

  it('resizeRgba trung bình theo vùng', () => {
    const src = new Uint8Array([0, 0, 0, 255, 100, 100, 100, 255, 200, 200, 200, 255, 100, 100, 100, 255]);
    expect(Array.from(resizeRgba(src, 2, 2, 1, 1))).toEqual([100, 100, 100, 255]);
  });

  it('tệp hỏng/không phải HEIC -> PHOTO_HEIC_FAILED và không để lại JPG dở dang', async () => {
    const dir = tmp();
    const bad = join(dir, 'bad.heic');
    writeFileSync(bad, 'đây không phải ảnh HEIC');
    await expect(convertHeicFile(bad, join(dir, 'out.jpg'))).rejects.toMatchObject({ code: 'PHOTO_HEIC_FAILED' });
    const cut = join(dir, 'cut.heic');
    writeFileSync(cut, readFileSync(PLAIN).subarray(0, 600));
    await expect(convertHeicFile(cut, join(dir, 'cut.jpg'))).rejects.toMatchObject({ code: 'PHOTO_HEIC_FAILED' });
    expect(readdirSync(dir).filter((n) => n.endsWith('.jpg') || n.endsWith('.part'))).toEqual([]);
  });
});

describe('PhotoPreparer (khi tải ảnh lên)', () => {
  it('HEIC -> JPG trong thư mục dữ liệu; lần sau dùng lại, không chuyển lại', async () => {
    const dir = tmp();
    const src = join(dir, 'IMG_0001.HEIC');
    copyFileSync(PLAIN, src);
    const convert = vi.fn((s: string, d: string) => convertHeicFile(s, d));
    const prep = new PhotoPreparer(join(dir, 'uploads'), convert);
    const a = await prep.prepare(src);
    expect(a.converted).toBe(true);
    expect(a.path.startsWith(join(dir, 'uploads'))).toBe(true);
    expect(a.path.endsWith('.jpg')).toBe(true);
    expect(readJpeg(a.path).width).toBe(320);
    const b = await prep.prepare(src);
    expect(b).toEqual(a);
    expect(convert).toHaveBeenCalledTimes(1);
    rmSync(src);
    expect(readJpeg(a.path).height).toBe(240);
  });

  it('ảnh JPG/PNG và đường dẫn không tồn tại được giữ nguyên', async () => {
    const dir = tmp();
    const jpg = join(dir, 'a.jpg');
    writeFileSync(jpg, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1]));
    const convert = vi.fn();
    const prep = new PhotoPreparer(join(dir, 'u'), convert);
    expect(await prep.prepare(jpg)).toEqual({ path: jpg, converted: false });
    expect(await prep.prepare(join(dir, 'khong-co.heic'))).toEqual({ path: join(dir, 'khong-co.heic'), converted: false });
    expect(convert).not.toHaveBeenCalled();
  });

  it('HEIC bị đổi đuôi .jpg vẫn được nhận ra bằng nội dung và chuyển', async () => {
    const dir = tmp();
    const sneaky = join(dir, 'IMG_1.jpg');
    copyFileSync(PLAIN, sneaky);
    const out = await new PhotoPreparer(join(dir, 'u')).prepare(sneaky);
    expect(out.converted).toBe(true);
    expect(readJpeg(out.path).width).toBe(320);
  });

  it('ảnh quá lớn -> PHOTO_TOO_LARGE; ảnh hỏng báo lỗi nhưng lần sau ảnh tốt vẫn chuyển được', async () => {
    const dir = tmp();
    const huge = join(dir, 'huge.heic');
    writeFileSync(huge, '');
    truncateSync(huge, 120 * 1024 * 1024 + 1);
    const prep = new PhotoPreparer(join(dir, 'u'));
    await expect(prep.prepare(huge)).rejects.toMatchObject({ code: 'PHOTO_TOO_LARGE' });
    const bad = join(dir, 'bad.heic');
    writeFileSync(bad, 'hỏng');
    await expect(prep.prepare(bad)).rejects.toMatchObject({ code: 'PHOTO_HEIC_FAILED' });
    const good = join(dir, 'good.heic');
    copyFileSync(IROT, good);
    expect((await prep.prepare(good)).converted).toBe(true);
  });

  it('nhiều ảnh cùng lúc được chuyển lần lượt (một ảnh một lần) và cùng ảnh không bị chuyển hai lần', async () => {
    const dir = tmp();
    let running = 0;
    let peak = 0;
    const convert = async (s: string, d: string) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 15));
      const res = await convertHeicFile(s, d);
      running--;
      return res;
    };
    const files = ['a', 'b', 'c'].map((n) => {
      const f = join(dir, `${n}.heic`);
      writeFileSync(f, readFileSync(PLAIN));
      return f;
    });
    const prep = new PhotoPreparer(join(dir, 'u'), convert);
    const res = await Promise.all([...files, files[0]!].map((f) => prep.prepare(f)));
    expect(peak).toBe(1);
    expect(res[0]).toEqual(res[3]);
  });
});

describe('giải mã HEIC trong worker thread (không chặn vòng lặp sự kiện)', () => {
  const work = mkdtempSync(join(tmpdir(), 'aps-heic-worker-'));
  const workerFile = join(work, 'heicWorker.cjs');
  afterAll(() => rmSync(work, { recursive: true, force: true }));

  it('worker thật chuyển được ảnh và luồng chính vẫn chạy trong lúc chuyển', async () => {
    await build({
      entryPoints: [resolve(import.meta.dirname, '..', 'src', 'orchestrator', 'photos', 'heicWorker.ts')],
      outfile: workerFile,
      bundle: true,
      platform: 'node',
      format: 'cjs',
      logLevel: 'silent',
    });
    const dir = tmp();
    mkdirSync(join(dir, 'u'));
    const src = join(dir, 'wide.heic');
    copyFileSync(WIDE, src);
    const prep = new PhotoPreparer(join(dir, 'u'), workerConverter(workerFile));
    let ticks = 0;
    const timer = setInterval(() => ticks++, 5);
    const t0 = Date.now();
    const out = await prep.prepare(src);
    const elapsed = Date.now() - t0;
    clearInterval(timer);
    expect(readJpeg(out.path).width).toBe(3840);
    expect(ticks).toBeGreaterThanOrEqual(Math.floor(elapsed / 5 / 3));
    expect(ticks).toBeGreaterThan(3);

    const bad = join(dir, 'bad.heic');
    writeFileSync(bad, 'hỏng');
    await expect(new PhotoPreparer(join(dir, 'u2'), workerConverter(workerFile)).prepare(bad)).rejects.toMatchObject({ code: 'PHOTO_HEIC_FAILED' });
  }, 60_000);
});
