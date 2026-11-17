import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { IpcValidationError, JobRecord, dispatchInvoke, isSlideshowRequest, type EventChannel, type EventPayload, type SlideshowCreateReqInput } from '@aps/shared';
import { MIGRATIONS, openDb } from '../src/orchestrator/db.js';
import { JobStore } from '../src/orchestrator/jobStore.js';
import { createOrchestrator, type Orchestrator } from '../src/orchestrator/orchestrator.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const FONT = join(here, '..', 'resources', 'fonts', 'BeVietnamPro-Bold.ttf');

function findLgplFfmpeg(): string {
  const env = process.env.APS_TEST_FFMPEG_LGPL;
  if (env && existsSync(env)) return env;
  const cache = join(repo, '.cache', 'ffmpeg');
  if (existsSync(cache)) {
    for (const d of readdirSync(cache)) {
      const p = join(cache, d, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if (existsSync(p)) return p;
    }
  }
  return '';
}
const FF = findLgplFfmpeg();

const dirs: string[] = [];
const orchestrators: Orchestrator[] = [];
afterEach(async () => {
  for (const o of orchestrators.splice(0)) await o.shutdown();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeImage(out: string, source: string): void {
  const r = spawnSync(FF, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', source, '-frames:v', '1', out]);
  if (r.status !== 0) throw new Error(`không tạo được ảnh thử: ${r.stderr}`);
}

function probe(file: string): string {
  const ffprobe = join(dirname(FF), 'ffprobe');
  const r = spawnSync(existsSync(ffprobe) ? ffprobe : 'ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,pix_fmt', '-of', 'csv=p=0', file]);
  return r.stdout.toString().trim();
}

function setup(dir = mkdtempSync(join(tmpdir(), 'aps-slide-q-'))) {
  if (!dirs.includes(dir)) dirs.push(dir);
  const events: JobRecord[] = [];
  const orch = createOrchestrator(
    {
      dataDir: dir,
      workerScript: join(repo, 'blender-worker', 'worker.py'),
      manifestPath: join(dir, 'none.json'),
      productionKeysDir: null,
      release: false,
      blenderOverride: '/nonexistent/blender',
      ffmpegOverride: FF || 'ffmpeg',
      fontPath: FONT,
      env: {},
    },
    <C extends EventChannel>(channel: C, payload: EventPayload<C>) => {
      if (channel === 'jobs:changed') events.push(payload as JobRecord);
    },
  );
  orchestrators.push(orch);
  const call = <T = unknown>(channel: string, req: unknown) => dispatchInvoke(orch.handlers, channel, req) as Promise<T>;
  return { dir, orch, events, call };
}

describe.skipIf(FF === '')('pipeline slideshow trong hàng đợi SQLite (ffmpeg LGPL thật, IPC có kiểu)', () => {
  let media = '';
  let photo = '';
  let photo2 = '';
  let logo = '';
  beforeAll(() => {
    media = mkdtempSync(join(tmpdir(), 'aps-slide-media-'));
    photo = join(media, 'anh-1.jpg');
    photo2 = join(media, 'anh 2.jpg');
    logo = join(media, 'logo.png');
    makeImage(photo, 'testsrc2=s=1600x1200');
    makeImage(photo2, 'gradients=s=1200x1600:seed=3');
    makeImage(logo, 'color=c=0xff0000:s=240x240');
    return () => rmSync(media, { recursive: true, force: true });
  });

  const req = (over: Partial<SlideshowCreateReqInput> = {}, values: Record<string, string> = {}): SlideshowCreateReqInput => ({
    templateId: 'bhol-gioi-thieu-san-pham',
    quality: 'preview',
    input: {
      values: { businessName: 'Cửa hàng Mẫu', phone: '0901234567', itemName: 'Áo thun cotton', price: '199000', ...values },
      photos: { anh1: photo },
    },
    ...over,
  });

  it('slideshow:create -> hàng đợi -> mp4 H.264 yuv420p đúng kích thước, cột pipeline/engine đúng, tiến độ đi qua encoding', async () => {
    const { orch, events, call } = setup();
    const res = await call<{ job: JobRecord; warnings: unknown[] }>('slideshow:create', req({ logoPath: logo }));
    expect(res.job.pipeline).toBe('slideshow');
    expect(res.job.engine).toBe('ffmpeg');
    expect(res.job.status).toBe('queued');
    expect(isSlideshowRequest(res.job.request)).toBe(true);
    await orch.queue.idle();
    const done = orch.queue.get(res.job.id)!;
    expect(done.status).toBe('done');
    expect(done.progress).toBe(1);
    expect(probe(done.outputPath!)).toBe('h264,540,960,yuv420p');
    const statuses = events.filter((e) => e.id === res.job.id).map((e) => e.status);
    expect(statuses).toEqual(expect.arrayContaining(['queued', 'preparing', 'encoding', 'done']));
    expect(statuses).not.toContain('rendering');
    expect(Math.max(...events.map((e) => e.progress))).toBe(1);
    const mid = events.filter((e) => e.status === 'encoding' && e.progress > 0 && e.progress < 1);
    expect(mid.length).toBeGreaterThan(0);
  }, 60_000);

  it('khớp lại sau khi mở lại DB: job slideshow đọc được từ SQLite, cùng id và request', async () => {
    const first = setup();
    const { job } = await first.call<{ job: JobRecord }>('slideshow:create', req({ target: 'cloud' }));
    await first.orch.shutdown();
    orchestrators.splice(0);
    const second = setup(first.dir);
    const again = second.orch.queue.get(job.id)!;
    expect(again.pipeline).toBe('slideshow');
    expect(again.target).toBe('cloud');
    expect(again.request).toEqual(job.request);
  });

  it('target cloud được nhận nhưng không bao giờ chạy trên máy này (chờ V1)', async () => {
    const { orch, call } = setup();
    const { job } = await call<{ job: JobRecord }>('slideshow:create', req({ target: 'cloud' }));
    await new Promise((r) => setTimeout(r, 300));
    expect(orch.queue.get(job.id)!.status).toBe('queued');
  });

  it('slideshow:validate báo lỗi tiếng Việt cho SĐT sai, giá mơ hồ, ảnh HEIC, ảnh không tồn tại, thiếu ảnh bắt buộc', async () => {
    const { call } = setup();
    const bad = await call<{ ok: boolean; issues: { field: string; code: string; message: string }[] }>(
      'slideshow:validate',
      req({}, { phone: '12345', price: '199' }),
    );
    expect(bad.ok).toBe(false);
    expect(bad.issues.map((i) => i.code).sort()).toEqual(['phone_invalid', 'price_ambiguous']);
    expect(bad.issues.find((i) => i.code === 'phone_invalid')!.message).toMatch(/Số điện thoại chưa đúng/);

    const heic = await call<{ ok: boolean; issues: { code: string; message: string }[] }>(
      'slideshow:validate',
      req({ input: { values: { businessName: 'A', phone: '0901234567', itemName: 'B' }, photos: { anh1: '/x/IMG_0001.HEIC' } } }),
    );
    expect(heic.issues.map((i) => i.code)).toEqual(['photo_heic']);
    expect(heic.issues[0]!.message).toMatch(/HEIC/);

    const missing = await call<{ ok: boolean; issues: { code: string }[] }>(
      'slideshow:validate',
      req({ input: { values: { businessName: 'A', phone: '0901234567', itemName: 'B' }, photos: { anh1: join(media, 'khong-co.jpg') } } }),
    );
    expect(missing.issues.map((i) => i.code)).toEqual(['photo_not_found']);

    const none = await call<{ issues: { code: string }[] }>('slideshow:validate', req({ input: { values: {}, photos: {} } }));
    expect(none.issues.map((i) => i.code)).toEqual(expect.arrayContaining(['required', 'photo_missing']));

    const ok = await call<{ ok: boolean; warnings: { code: string }[] }>('slideshow:validate', req({}, { promo: 'Giảm 20% 🎉' }));
    expect(ok.ok).toBe(true);
  });

  it('slideshow:create từ chối dữ liệu sai ở main/orchestrator (zod + schema mẫu), không tạo job', async () => {
    const { orch, call } = setup();
    await expect(call('slideshow:create', req({}, { phone: 'abc' }))).rejects.toMatchObject({ code: 'TEMPLATE_INPUT_INVALID' });
    await expect(call('slideshow:create', req({ templateId: 'khong-ton-tai' }))).rejects.toMatchObject({ code: 'TEMPLATE_NOT_FOUND' });
    await expect(call('slideshow:create', { ...req(), job: { scenes: [] } })).rejects.toBeInstanceOf(IpcValidationError);
    await expect(call('slideshow:create', req({ target: 'mars' as never }))).rejects.toBeInstanceOf(IpcValidationError);
    expect(orch.queue.list()).toHaveLength(0);
  });

  it('thiếu ảnh sau khi xếp hàng -> failed với mã SLIDESHOW_PHOTO_MISSING (không tự thử lại); chọn lại ảnh rồi Thử lại thì chạy xong', async () => {
    const { orch, call } = setup();
    const tmpPhoto = join(media, 'tam.jpg');
    copyFileSync(photo, tmpPhoto);
    const { job } = await call<{ job: JobRecord }>('slideshow:create', req({ input: { values: { businessName: 'A', phone: '0901234567', itemName: 'B' }, photos: { anh1: tmpPhoto } } }));
    renameSync(tmpPhoto, `${tmpPhoto}.moved`);
    await orch.queue.idle();
    const failed = orch.queue.get(job.id)!;
    expect(failed.status).toBe('failed');
    expect(failed.errorCode).toBe('SLIDESHOW_PHOTO_MISSING');
    expect(failed.failures).toBe(1);
    renameSync(`${tmpPhoto}.moved`, tmpPhoto);
    expect((await call<{ ok: boolean }>('jobs:retry', { id: job.id })).ok).toBe(true);
    await orch.queue.idle();
    expect(orch.queue.get(job.id)!.status).toBe('done');
  }, 60_000);

  it('hủy job đang dựng: trạng thái canceled, không để lại tệp .part', async () => {
    const { orch, call } = setup();
    // Mẫu dài + preview chậm đủ để kịp hủy: dùng bản final của mẫu 15 giây.
    const { job } = await call<{ job: JobRecord }>('slideshow:create', req({ quality: 'final', templateId: 'xd-gioi-thieu-du-an', input: { values: { businessName: 'A', phone: '0901234567', itemName: 'Nhà phố' }, photos: { d1: photo, d2: photo2 } } }));
    for (let i = 0; i < 100 && !['encoding', 'preparing'].includes(orch.queue.get(job.id)!.status); i++) await new Promise((r) => setTimeout(r, 20));
    await call('jobs:cancel', { id: job.id });
    await orch.queue.idle();
    const canceled = orch.queue.get(job.id)!;
    expect(canceled.status).toBe('canceled');
    expect(readdirSync(canceled.workDir!).filter((f) => f.includes('.part'))).toEqual([]);
    expect((await call<{ ok: boolean }>('jobs:retry', { id: job.id })).ok).toBe(true);
    await orch.queue.idle();
    expect(orch.queue.get(job.id)!.status).toBe('done');
  }, 90_000);

  it('job Blender và slideshow cùng một hàng đợi, chạy lần lượt theo ưu tiên (preview trước final)', async () => {
    const { orch, call } = setup();
    const a = await call<{ job: JobRecord }>('slideshow:create', req({ quality: 'final' }));
    const c = await call<{ job: JobRecord }>('slideshow:create', req({ quality: 'final' }));
    const b = await call<{ job: JobRecord }>('slideshow:create', req({ quality: 'preview' }));
    const blender = (await call<JobRecord>('jobs:create', { product: { glbPath: '/khong-co.glb' }, output: { kind: 'image' }, target: 'cloud' })).id;
    await orch.queue.idle();
    expect(orch.queue.get(a.job.id)!.status).toBe('done');
    expect(orch.queue.get(b.job.id)!.status).toBe('done');
    expect(orch.queue.get(blender)!.pipeline).toBe('blender');
    expect(orch.queue.get(blender)!.status).toBe('queued');
    expect(orch.queue.get(c.job.id)!.status).toBe('done');
    expect(orch.queue.get(b.job.id)!.startedAt!).toBeLessThanOrEqual(orch.queue.get(c.job.id)!.startedAt!);
  }, 90_000);

  it('slideshow:caption trả 3 kênh từ đúng dữ liệu nhập; dữ liệu chưa hợp lệ -> rỗng', async () => {
    const { call } = setup();
    const caps = await call<{ channel: string; text: string; hashtags: string[] }[]>('slideshow:caption', { templateId: 'bhol-gioi-thieu-san-pham', input: req().input });
    expect(caps.map((c) => c.channel)).toEqual(['facebook', 'zalo', 'tiktok']);
    expect(caps[0]!.text).toContain('Áo thun cotton');
    expect(caps[0]!.text).toContain('0901 234 567');
    expect(caps[1]!.hashtags).toEqual([]);
    expect(await call('slideshow:caption', { templateId: 'bhol-gioi-thieu-san-pham', input: { values: {}, photos: {} } })).toEqual([]);
  });

  it('dùng phông đi kèm app: chữ có dấu tiếng Việt không làm hỏng việc dựng video', async () => {
    expect(statSync(FONT).size).toBeGreaterThan(50_000);
    const { orch, call } = setup();
    const { job } = await call<{ job: JobRecord }>('slideshow:create', req({}, { itemName: 'Ếch ơi, đường Nguyễn Trãi' }));
    await orch.queue.idle();
    expect(orch.queue.get(job.id)!.status).toBe('done');
  }, 60_000);
});

describe('hồ sơ doanh nghiệp (SQLite settings, không cần ffmpeg)', () => {
  it('nhớ tên/SĐT/địa chỉ/logo/ngành giữa các lần mở app; logo được chép vào thư mục dữ liệu; null xoá trường', async () => {
    const media = mkdtempSync(join(tmpdir(), 'aps-profile-'));
    dirs.push(media);
    const logo = join(media, 'logo.png');
    writeFileSync(logo, Buffer.from('89504e470d0a1a0a', 'hex'));
    const first = setup();
    expect(await first.call('profile:get', {})).toEqual({});
    const saved = await first.call<Record<string, string>>('profile:set', {
      businessName: 'Nhôm Kính Hoàng Gia',
      phone: '0901 234 567',
      address: '12 Nguyễn Trãi, Đà Lạt',
      logoPath: logo,
      industry: 'nhom-kinh',
      templateId: 'nk-cong-trinh',
    });
    expect(saved.logoPath).toContain(join(first.dir, 'profile'));
    expect(saved.logoPath).not.toBe(logo);
    expect(existsSync(saved.logoPath!)).toBe(true);
    rmSync(logo);
    await first.orch.shutdown();
    orchestrators.splice(0);

    const second = setup(first.dir);
    expect(await second.call('profile:get', {})).toEqual(saved);
    const after = await second.call<Record<string, string>>('profile:set', { address: null, logoPath: null });
    expect(after.address).toBeUndefined();
    expect(after.logoPath).toBeUndefined();
    expect(after.businessName).toBe('Nhôm Kính Hoàng Gia');
    expect(existsSync(saved.logoPath!)).toBe(false);
    await expect(second.call('profile:set', { logoPath: '/tmp/x.png', unknownKey: 1 })).rejects.toBeInstanceOf(IpcValidationError);
  });

  it('logo sai định dạng bị từ chối với mã LOGO_FORMAT', async () => {
    const media = mkdtempSync(join(tmpdir(), 'aps-profile-'));
    dirs.push(media);
    const bad = join(media, 'logo.exe');
    writeFileSync(bad, 'x');
    const { call } = setup();
    await expect(call('profile:set', { logoPath: bad })).rejects.toMatchObject({ code: 'LOGO_FORMAT' });
  });
});

describe('migration SQLite v3 chỉ thêm', () => {
  it('DB v2 có job Blender cũ mở được; job cũ có pipeline blender; bảng settings được tạo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aps-mig-'));
    dirs.push(dir);
    const path = join(dir, 'aps.sqlite');
    const old = new DatabaseSync(path);
    for (const m of MIGRATIONS.slice(0, 2)) old.exec(m);
    old.exec('PRAGMA user_version = 2');
    old.prepare(
      `INSERT INTO jobs (id,name,target,priority,status,kind,engine,request_json,total_frames,created_at,updated_at) VALUES ('old1','Cũ','local','final','queued','image','eevee',?,1,1,1)`,
    ).run(JSON.stringify({ product: { glbPath: '/a.glb' }, output: { kind: 'image' } }));
    old.close();
    const upgraded = openDb(path);
    expect(new JobStore(upgraded).get('old1')!.pipeline).toBe('blender');
    expect(upgraded.prepare('SELECT count(*) AS n FROM settings').get()).toEqual({ n: 0 });
    expect((upgraded.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    expect(existsSync(`${path}.bak-v2`)).toBe(true);
    upgraded.close();
  });
});
