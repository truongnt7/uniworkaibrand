import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SlideshowJob } from '@aps/shared';
import { planSlideshow } from '@aps/render-core';
import {
  INDUSTRIES,
  RAW_LIBRARY,
  TemplateLibraryFile,
  allTemplates,
  compileTemplate,
  extractPlaceholders,
  getTemplate,
  parseLibraryFile,
  templateLibraryJsonSchema,
  templatesFor,
  type Template,
} from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function exampleInput(t: Template) {
  const values: Record<string, string> = {};
  for (const f of t.fields) values[f.key] = f.example;
  const photos: Record<string, string> = {};
  const captions: Record<string, string> = {};
  for (const p of t.photos) {
    photos[p.id] = `/photos/${p.id}.jpg`;
    if (p.caption) captions[p.id] = p.caption.example;
  }
  return { values, photos, captions };
}

describe('thư viện mẫu', () => {
  it('có đủ 5 ngành, mỗi ngành ít nhất 3 mẫu, id duy nhất', () => {
    expect(INDUSTRIES).toHaveLength(5);
    for (const i of INDUSTRIES) expect(templatesFor(i).length, i).toBeGreaterThanOrEqual(3);
    const ids = allTemplates().map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(15);
  });

  it('mọi mẫu hiện là giả định chưa xác nhận với khách thật', () => {
    for (const t of allTemplates()) expect(t.evidence, t.id).toBe('assumption');
  });

  it('id mẫu có tiền tố theo ngành và getTemplate tìm được', () => {
    for (const t of allTemplates()) expect(getTemplate(t.id)).toBe(t);
    expect(getTemplate('khong-ton-tai')).toBeUndefined();
  });

  it('JSON Schema xuất ra khớp tệp schema/template-library.schema.json (chạy `pnpm --filter @aps/templates schema:export` nếu lệch)', () => {
    const file = join(here, '../schema/template-library.schema.json');
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(templateLibraryJsonSchema());
  });

  it('mọi mẫu biên dịch được với dữ liệu ví dụ ở mọi tỉ lệ hỗ trợ, ra SlideshowJob hợp lệ và lệnh ffmpeg', () => {
    for (const t of allTemplates()) {
      for (const aspect of t.aspects) {
        const { job } = compileTemplate(t, exampleInput(t), { jobId: `${t.id}-${aspect}`, fontPath: '/font.ttf', aspect, quality: 'preview' });
        expect(() => SlideshowJob.parse(job), `${t.id} ${aspect}`).not.toThrow();
        const plan = planSlideshow(job, { outputPath: '/o.mp4', workDir: '/w' });
        expect(plan.durationS, t.id).toBeGreaterThan(5);
        expect(plan.durationS, t.id).toBeLessThanOrEqual(45);
      }
    }
  });

  it('mọi mẫu dựng được chỉ với ảnh bắt buộc + trường bắt buộc (không có ảnh/trường tuỳ chọn)', () => {
    for (const t of allTemplates()) {
      const values: Record<string, string> = {};
      for (const f of t.fields.filter((x) => x.required)) values[f.key] = f.example;
      const photos: Record<string, string> = {};
      for (const p of t.photos.filter((x) => x.required)) photos[p.id] = `/photos/${p.id}.png`;
      const { job } = compileTemplate(t, { values, photos }, { jobId: t.id, fontPath: '/font.ttf' });
      expect(job.scenes.length, t.id).toBeGreaterThanOrEqual(2);
      const texts = job.scenes.flatMap((s) => s.texts.map((x) => x.text));
      for (const t2 of texts) expect(t2, t.id).not.toMatch(/\{\{|\}\}/);
    }
  });

  it('chữ tĩnh trong mẫu không chứa chữ số, emoji, đường link hay tuyên bố không kiểm chứng được', () => {
    const forbidden = /(số\s*1|số\s*một|nhất|cam kết|bảo hành|chính hãng|miễn phí|100\s*%|giảm|rẻ|uy tín|đảm bảo|hiệu quả|top\s)/i;
    const strip = (s: string) => s.replace(/\{\{[^}]*\}\}/g, '');
    for (const t of allTemplates()) {
      // Chữ lên video và caption: không được có số nào ngoài số người dùng nhập.
      const shown = [...t.scenes.flatMap((s) => s.texts.map((x) => x.text)), ...t.caption.lines, ...t.caption.hashtags].map(strip);
      for (const s of shown) expect(s, `${t.id}: "${s}"`).not.toMatch(/\d/);
      for (const s of [...shown, t.name, t.summary]) {
        expect(s, `${t.id}: "${s}"`).not.toMatch(forbidden);
        expect(s, `${t.id}: "${s}"`).not.toMatch(/https?:|www\.|\p{Extended_Pictographic}/u);
      }
    }
  });

  it('văn bản là tiếng Việt có dấu, dạng NFC', () => {
    for (const t of allTemplates()) {
      for (const s of [t.name, t.summary, ...t.fields.map((f) => f.label), ...t.photos.map((p) => p.label)]) {
        expect(s.normalize('NFC'), t.id).toBe(s);
      }
      expect(t.summary, t.id).toMatch(/[ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i);
    }
  });

  it('mọi {{placeholder}} dùng trường đã khai báo; mẫu có SĐT và tên cơ sở bắt buộc', () => {
    for (const t of allTemplates()) {
      const declared = new Set<string>(t.fields.map((f) => f.key));
      const all = [...t.scenes.flatMap((s) => s.texts.map((x) => x.text)), ...t.caption.lines].flatMap(extractPlaceholders);
      for (const ph of all) expect(ph.startsWith('caption:') || declared.has(ph), `${t.id} ${ph}`).toBe(true);
      expect(t.fields.find((f) => f.key === 'phone')?.required, t.id).toBe(true);
      expect(t.fields.find((f) => f.key === 'businessName')?.required, t.id).toBe(true);
    }
  });

  it('dữ liệu ví dụ là dữ liệu giả (không phải số điện thoại thật của ai)', () => {
    for (const t of allTemplates()) expect(t.fields.find((f) => f.key === 'phone')?.example, t.id).toBe('0901 234 567');
  });
});

describe('schema từ chối mẫu sai', () => {
  type Obj = Record<string, unknown>;
  const sample = () => clone(RAW_LIBRARY['nhom-kinh']) as { industry: string; templates: Obj[] };

  it('tệp đúng thì qua', () => {
    expect(() => parseLibraryFile('nhom-kinh', sample())).not.toThrow();
  });

  it('khoá lạ (script, exec) bị từ chối ở mẫu, cảnh và chữ', () => {
    for (const mutate of [
      (f: ReturnType<typeof sample>) => (f.templates[0]!['script'] = 'import os'),
      (f: ReturnType<typeof sample>) => ((f.templates[0]!['scenes'] as Record<string, unknown>[])[0]!['exec'] = 'x'),
      (f: ReturnType<typeof sample>) => (((f.templates[0]!['scenes'] as { texts: Record<string, unknown>[] }[])[0]!.texts[0]!)['bpy'] = '1'),
    ]) {
      const f = sample();
      mutate(f);
      expect(() => parseLibraryFile('nhom-kinh', f)).toThrowError(/không hợp lệ/);
    }
  });

  it('từ chối: placeholder không khai báo, trường lạ, ảnh không tồn tại, thiếu SĐT, id sai định dạng, quá dài', () => {
    interface Loose {
      id: string;
      aspects: string[];
      defaultAspect: string;
      fields: { key: string; required: boolean }[];
      photos: { id: string; label?: string; required: boolean }[];
      scenes: { slot?: string; durationS: number; transition?: string; texts: { text: string }[] }[];
    }
    const cases: [string, (t: Loose) => void, RegExp][] = [
      ['placeholder ngoài danh sách', (t) => (t.scenes[0]!.texts[0]!.text = '{{password}}'), /không tồn tại/],
      ['placeholder trường chưa khai báo', (t) => (t.fields = t.fields.filter((f) => f.key !== 'itemName')), /không khai báo/],
      ['cảnh dùng ảnh không có', (t) => (t.scenes[0]!.slot = 'ma'), /không được khai báo/],
      ['thiếu số điện thoại', (t) => (t.fields = t.fields.filter((f) => f.key !== 'phone')), /phone/],
      ['SĐT không bắt buộc', (t) => (t.fields.find((f) => f.key === 'phone')!.required = false), /phải bắt buộc/],
      ['id sai', (t) => (t.id = 'Có Dấu!'), /chỉ gồm/],
      ['quá 45 giây', (t) => t.scenes.forEach((s) => (s.durationS = 15)), /45 giây/],
      ['transition lạ', (t) => (t.scenes[1]!.transition = 'exec'), /Invalid option|expected/i],
      ['ảnh dư không cảnh nào dùng', (t) => t.photos.push({ id: 'du', label: 'Dư', required: false }), /không được cảnh nào dùng/],
      ['cảnh đầu dùng ảnh tuỳ chọn', (t) => (t.photos[0]!.required = false), /cảnh đầu/],
      ['defaultAspect ngoài aspects', (t) => ((t.aspects = ['1:1']), (t.defaultAspect = '9:16')), /defaultAspect/],
    ];
    for (const [name, mutate, re] of cases) {
      const f = sample();
      mutate(f.templates[0]! as unknown as Loose);
      const r = TemplateLibraryFile.safeParse(f);
      expect(r.success, name).toBe(false);
      if (!r.success) expect(JSON.stringify(r.error.issues), name).toMatch(re);
    }
  });

  it('từ chối mẫu đặt sai ngành/tệp và thư viện ít hơn 3 mẫu', () => {
    const f = sample();
    f.templates[0]!['industry'] = 'xay-dung';
    expect(() => parseLibraryFile('nhom-kinh', f)).toThrow();
    const g = sample();
    g.templates = g.templates.slice(0, 2);
    expect(() => parseLibraryFile('nhom-kinh', g)).toThrow();
    expect(() => parseLibraryFile('xay-dung', sample())).toThrow();
  });

  it('lỗi nạp thư viện nêu rõ ngành và đường dẫn trường', () => {
    const f = sample();
    (f.templates[0]!['scenes'] as { slot: string }[])[0]!.slot = 'ma';
    expect(() => parseLibraryFile('nhom-kinh', f)).toThrowError(/ngành "nhom-kinh".*templates\.0\.scenes\.0\.slot/);
  });
});
