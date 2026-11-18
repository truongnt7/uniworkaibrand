import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MIGRATIONS, openDb } from '../src/orchestrator/db.js';
import { DEFAULT_DRAFT_NAME, DraftStore, MAX_DRAFTS } from '../src/orchestrator/drafts.js';

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-drafts-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const form = (over: Record<string, unknown> = {}) => ({
  industry: 'ban-hang-online',
  templateId: 'tpl-1',
  aspect: '9:16',
  values: { shopName: 'Tiệm Hoa', phone: '0901 234 567' },
  photos: { p1: '/a/1.jpg', p2: '/a/2.jpg' },
  captions: { p1: 'Hoa hồng' },
  ...over,
});

describe('lưu nháp từng bài', () => {
  it('tạo, cập nhật, liệt kê theo thời gian sửa, xóa', () => {
    let t = 1000;
    const store = new DraftStore(openDb(':memory:'), () => t++, () => true);
    const a = store.save({ name: 'Bài A', form: form() });
    const b = store.save({ name: 'Bài B', form: form({ photos: {} }) });
    expect(store.list().map((d) => d.name)).toEqual(['Bài B', 'Bài A']);
    expect(store.list().find((d) => d.id === a.id)).toMatchObject({ photoCount: 2, industry: 'ban-hang-online', templateId: 'tpl-1' });

    const a2 = store.save({ id: a.id, name: 'Bài A sửa', form: form({ values: { shopName: 'Mới' } }) });
    expect(a2.id).toBe(a.id);
    expect(a2.createdAt).toBe(a.createdAt);
    expect(a2.updatedAt).toBeGreaterThan(a.updatedAt);
    expect(store.list().map((d) => d.name)).toEqual(['Bài A sửa', 'Bài B']);
    expect(store.get(a.id)?.form.values).toEqual({ shopName: 'Mới' });

    expect(store.remove(b.id)).toBe(true);
    expect(store.remove(b.id)).toBe(false);
    expect(store.get(b.id)).toBeNull();
    expect(store.list()).toHaveLength(1);
  });

  it('tên trống lấy tên mặc định; tên được cắt khoảng trắng', () => {
    const store = new DraftStore(openDb(':memory:'));
    expect(store.save({ name: '   ', form: form() }).name).toBe(DEFAULT_DRAFT_NAME);
    expect(store.save({ name: '  Bài X  ', form: form() }).name).toBe('Bài X');
  });

  it('đóng DB rồi mở lại vẫn còn nguyên (tên, mẫu, ảnh, thông tin, chú thích)', () => {
    const dir = tmp();
    const path = join(dir, 'aps.sqlite');
    const db1 = openDb(path);
    const saved = new DraftStore(db1).save({ name: 'Bài khai trương', form: form({ logoPath: '/a/logo.png', musicPath: '/a/nhac.mp3' }) });
    db1.close();
    const db2 = openDb(path);
    const got = new DraftStore(db2, Date.now, () => true).get(saved.id)!;
    expect(got.name).toBe('Bài khai trương');
    expect(got.form).toEqual(form({ logoPath: '/a/logo.png', musicPath: '/a/nhac.mp3' }));
    expect(got.missing).toEqual([]);
    db2.close();
  });

  it('liệt kê tệp không còn trên máy ở `missing`, không lặp', () => {
    const dir = tmp();
    const here = join(dir, 'con.jpg');
    writeFileSync(here, 'x');
    const store = new DraftStore(openDb(':memory:'));
    const saved = store.save({
      name: 'B',
      form: form({ photos: { p1: here, p2: join(dir, 'mat.jpg'), p3: join(dir, 'mat.jpg') }, logoPath: join(dir, 'logo-mat.png') }),
    });
    expect(store.get(saved.id)!.missing.sort()).toEqual([join(dir, 'logo-mat.png'), join(dir, 'mat.jpg')].sort());
  });

  it('từ chối form sai (khóa lạ, quá nhiều ảnh, nháp quá lớn); không ghi gì', () => {
    const store = new DraftStore(openDb(':memory:'));
    expect(() => store.save({ name: 'x', form: { ...form(), extra: 1 } as never })).toThrow();
    const many = Object.fromEntries(Array.from({ length: 17 }, (_, i) => [`p${i}`, `/a/${i}.jpg`]));
    expect(() => store.save({ name: 'x', form: form({ photos: many }) })).toThrow();
    const big = Object.fromEntries(Array.from({ length: 16 }, (_, i) => [`c${i}`, 'x'.repeat(500)]));
    const vals = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`v${i}`, 'y'.repeat(2000)]));
    expect(() => store.save({ name: 'x', form: form({ captions: big, values: vals }) })).toThrow();
    expect(store.list()).toEqual([]);
  });

  it('giữ tối đa MAX_DRAFTS bài, bỏ bài cũ nhất', () => {
    let t = 1;
    const store = new DraftStore(openDb(':memory:'), () => t++);
    const first = store.save({ name: 'cũ nhất', form: form() });
    for (let i = 0; i < MAX_DRAFTS; i++) store.save({ name: `b${i}`, form: form() });
    const list = store.list();
    expect(list).toHaveLength(MAX_DRAFTS);
    expect(list.find((d) => d.id === first.id)).toBeUndefined();
    expect(list[0]!.name).toBe(`b${MAX_DRAFTS - 1}`);
  });

  it('dòng hỏng trong DB bị bỏ qua, không làm hỏng danh sách', () => {
    const db = openDb(':memory:');
    const store = new DraftStore(db);
    const ok = store.save({ name: 'ổn', form: form() });
    db.prepare("INSERT INTO drafts (id,name,form_json,created_at,updated_at) VALUES ('bad','hỏng','{không phải json',1,1)").run();
    expect(store.list().map((d) => d.id)).toEqual([ok.id]);
    expect(store.get('bad')).toBeNull();
  });
});

describe('migration SQLite v4 chỉ thêm bảng drafts', () => {
  it('DB v3 (có job, cài đặt) lên v4: dữ liệu cũ còn nguyên, có bản sao lưu', () => {
    const dir = tmp();
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'aps.sqlite');
    const old = new DatabaseSync(path);
    for (const m of MIGRATIONS.slice(0, 3)) old.exec(m);
    old.exec('PRAGMA user_version = 3');
    old.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('k', 'v', 1)").run();
    old.close();
    const up = openDb(path);
    expect((up.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    expect(up.prepare("SELECT value FROM settings WHERE key = 'k'").get()).toEqual({ value: 'v' });
    expect(up.prepare('SELECT count(*) AS n FROM drafts').get()).toEqual({ n: 0 });
    expect(existsSync(`${path}.bak-v3`)).toBe(true);
    up.close();
  });
});
