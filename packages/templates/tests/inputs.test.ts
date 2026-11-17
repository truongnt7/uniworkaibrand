import { describe, expect, it } from 'vitest';
import { TemplateInputError, compileTemplate, formatPhone, getTemplate, normalizePhone, normalizePrice, stripEmoji, validateInput } from '../src/index.js';

const t = getTemplate('bhol-gioi-thieu-san-pham')!;
const ok = { values: { businessName: 'Cửa hàng Mẫu', phone: '0901 234 567', itemName: 'Áo thun' }, photos: { anh1: '/p/a.jpg' } };

describe('số điện thoại', () => {
  it('chấp nhận di động, +84, có dấu chấm/gạch, số bàn có mã vùng, tổng đài; từ chối số sai', () => {
    expect(normalizePhone('0901 234 567')).toBe('0901234567');
    expect(normalizePhone('+84 901.234.567')).toBe('0901234567');
    expect(normalizePhone('84901234567')).toBe('0901234567');
    expect(normalizePhone('028 3822 1234')).toBe('02838221234');
    expect(normalizePhone('1900 1234')).toBe('19001234');
    for (const bad of ['', '12345', '090123456', '09012345678', '0101234567', 'abc', '0901 234 56a']) expect(normalizePhone(bad), bad).toBeNull();
  });
  it('định dạng dễ đọc', () => {
    expect(formatPhone('0901234567')).toBe('0901 234 567');
    expect(formatPhone('02838221234')).toBe('0283 822 1234');
    expect(formatPhone('19001234')).toBe('1900 1234');
  });
});

describe('giá', () => {
  it('thuần số được định dạng, chữ khách viết giữ nguyên, số trần nhỏ bị từ chối vì mơ hồ', () => {
    expect(normalizePrice('199000')).toEqual({ ok: true, value: '199.000đ' });
    expect(normalizePrice('1,500,000')).toEqual({ ok: true, value: '1.500.000đ' });
    expect(normalizePrice('199k')).toEqual({ ok: true, value: '199k' });
    expect(normalizePrice('Liên hệ')).toEqual({ ok: true, value: 'Liên hệ' });
    expect(normalizePrice('199')).toEqual({ ok: false });
    expect(normalizePrice('0')).toEqual({ ok: false });
  });
});

describe('validateInput: thông báo lỗi tiếng Việt dễ hiểu', () => {
  it('đủ dữ liệu thì ok, chuẩn hoá SĐT và giá', () => {
    const r = validateInput(t, { ...ok, values: { ...ok.values, price: '199000' } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.values.phone).toBe('0901 234 567');
      expect(r.input.values.price).toBe('199.000đ');
      expect(r.input.phoneDigits).toBe('0901234567');
    }
  });

  it('thiếu tên, SĐT sai, giá thiếu đơn vị, thiếu ảnh bắt buộc: báo đủ từng lỗi, nói rõ cách sửa', () => {
    const r = validateInput(t, { values: { phone: '123', itemName: 'Áo', price: '50' }, photos: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      const byField = Object.fromEntries(r.issues.map((i) => [i.field, i]));
      expect(byField['businessName']!.message).toBe('Bạn chưa nhập "Tên cơ sở / thương hiệu". Hãy nhập để video có đủ thông tin cho khách liên hệ.');
      expect(byField['phone']!.message).toContain('Hãy nhập đủ 10 số, ví dụ 0901 234 567');
      expect(byField['price']!.message).toContain('199.000đ hoặc 199k');
      expect(byField['photo:anh1']!.message).toBe('Hãy chọn ảnh cho "Ảnh chính của sản phẩm".');
      for (const i of r.issues) expect(i.message).toMatch(/[ăâêôơưđáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵ]/i);
    }
  });

  it('chữ quá dài bị báo kèm số ký tự', () => {
    const r = validateInput(t, { ...ok, values: { ...ok.values, itemName: 'x'.repeat(61) } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]).toMatchObject({ field: 'itemName', code: 'too_long' });
  });

  it('ảnh HEIC và định dạng lạ có hướng dẫn riêng; ảnh không thuộc mẫu bị từ chối', () => {
    const heic = validateInput(t, { ...ok, photos: { anh1: '/p/IMG_1.HEIC' } });
    expect(heic.ok).toBe(false);
    if (!heic.ok) expect(heic.issues[0]).toMatchObject({ code: 'photo_heic', message: expect.stringContaining('Tương thích nhất') });
    const gif = validateInput(t, { ...ok, photos: { anh1: '/p/a.gif' } });
    if (!gif.ok) expect(gif.issues[0]!.code).toBe('photo_format');
    const extra = validateInput(t, { ...ok, photos: { anh1: '/p/a.jpg', la: '/p/b.jpg' } });
    expect(extra.ok).toBe(false);
  });

  it('khung hình không hỗ trợ bị từ chối', () => {
    const r = validateInput(t, ok, { aspect: '16:9' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.code).toBe('aspect_unsupported');
  });

  it('emoji trong dữ liệu: cảnh báo, bỏ khỏi chữ trên video nhưng giữ nguyên trong dữ liệu', () => {
    const r = validateInput(t, { ...ok, values: { ...ok.values, promo: 'Quà tặng 🎁' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings.map((w) => w.code)).toEqual(['emoji_removed_in_video']);
    expect(stripEmoji('Quà tặng 🎁')).toBe('Quà tặng');
    const { job } = compileTemplate(t, { ...ok, values: { ...ok.values, promo: 'Quà tặng 🎁' } }, { jobId: 'x', fontPath: '/f.ttf' });
    const texts = job.scenes.flatMap((s) => s.texts.map((x) => x.text));
    expect(texts.join('|')).not.toMatch(/🎁/u);
  });
});

describe('compileTemplate', () => {
  it('ném TemplateInputError (mã TEMPLATE_INPUT_INVALID) khi dữ liệu sai', () => {
    expect(() => compileTemplate(t, { values: {}, photos: {} }, { jobId: 'x', fontPath: '/f.ttf' })).toThrowError(TemplateInputError);
    try {
      compileTemplate(t, { values: {}, photos: {} }, { jobId: 'x', fontPath: '/f.ttf' });
    } catch (e) {
      expect((e as TemplateInputError).code).toBe('TEMPLATE_INPUT_INVALID');
      expect((e as TemplateInputError).issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('SĐT trên video dùng khoảng trắng không ngắt dòng để không bị tách ở cuối dòng', () => {
    const { job } = compileTemplate(t, ok, { jobId: 'x', fontPath: '/f.ttf' });
    const phoneText = job.scenes.flatMap((s) => s.texts).find((x) => x.text.includes('0901'))!;
    expect(phoneText.text).toContain('0901\u00a0234\u00a0567');
  });

  it('trường tuỳ chọn để trống thì dòng chữ tương ứng và cảnh ảnh tuỳ chọn bị bỏ, không để lại chữ "undefined"/ngoặc', () => {
    const { job } = compileTemplate(t, ok, { jobId: 'x', fontPath: '/f.ttf' });
    expect(job.scenes.filter((s) => s.type === 'photo')).toHaveLength(1);
    const all = job.scenes.flatMap((s) => s.texts.map((x) => x.text)).join('|');
    expect(all).not.toMatch(/undefined|null|\{\{|Giá:/);
    expect(job.scenes[0]!.transition).toBe('none');
  });

  it('logo: chỉ ở cảnh cuối với end_card, suốt video với all, không với none; nhạc chỉ khi mẫu cho phép', () => {
    const base = { jobId: 'x', fontPath: '/f.ttf', logoPath: '/l.png', musicPath: '/m.mp3' };
    const a = compileTemplate(t, ok, base).job;
    expect(a.logo).toMatchObject({ position: 'top_center' });
    expect(a.logo!.t).toBeCloseTo(3, 6);
    expect(a.logo!.tEnd).toBeCloseTo(7, 6);
    expect(a.audio?.path).toBe('/m.mp3');
    const none = compileTemplate(getTemplate('nk-bao-gia')!, { values: { businessName: 'A', phone: '0901234567', itemName: 'Cửa' }, photos: { anh1: '/a.jpg' } }, base).job;
    expect(none.logo).toBeUndefined();
    const noMusic = compileTemplate(getTemplate('xd-tuyen-tho')!, { values: { businessName: 'A', phone: '0901234567', itemName: 'Thợ', detail: 'Lương thoả thuận' }, photos: {} }, base).job;
    expect(noMusic.audio).toBeUndefined();
  });

  it('màu thương hiệu thay màu chủ đạo ở thẻ màu; ảnh ghép thiếu ô thì còn lại vẫn ghép nếu ≥ 2 ảnh', () => {
    const c = getTemplate('bhol-bo-suu-tap')!;
    const { job } = compileTemplate(c, { values: { businessName: 'A', phone: '0901234567', itemName: 'Nhóm' }, photos: { a1: '/1.jpg', a2: '/2.jpg' } }, { jobId: 'x', fontPath: '/f.ttf', brandColor: '#123456' });
    const col = job.scenes[0]!;
    expect(col.type === 'collage' && col.imagePaths).toEqual(['/1.jpg', '/2.jpg']);
    expect(job.scenes.at(-1)).toMatchObject({ type: 'card', backgroundColor: '#123456' });
  });

  it('preview là nửa độ phân giải và kích thước luôn chẵn', () => {
    const final = compileTemplate(t, ok, { jobId: 'x', fontPath: '/f.ttf' }).job.output;
    const prev = compileTemplate(t, ok, { jobId: 'x', fontPath: '/f.ttf', quality: 'preview' }).job.output;
    expect(final).toMatchObject({ width: 1080, height: 1920 });
    expect(prev).toMatchObject({ width: 540, height: 960 });
    expect(compileTemplate(t, ok, { jobId: 'x', fontPath: '/f.ttf', aspect: '4:5' }).job.output).toMatchObject({ width: 1080, height: 1350 });
    for (const a of t.aspects) {
      const o = compileTemplate(t, ok, { jobId: 'x', fontPath: '/f.ttf', aspect: a, quality: 'preview' }).job.output;
      expect(o.width % 2).toBe(0);
      expect(o.height % 2).toBe(0);
    }
  });
});
