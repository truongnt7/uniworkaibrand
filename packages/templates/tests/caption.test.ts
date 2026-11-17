import { describe, expect, it } from 'vitest';
import { brandHashtag, buildCaptions, allTemplates, getTemplate, TemplateInputError } from '../src/index.js';

const input = {
  values: { businessName: 'Nhôm Kính Hoàng Gia', phone: '0901234567', itemName: 'Cửa nhôm kính', detail: 'Quận 9', address: '12 Đường Số 1' },
  photos: { c1: '/a.jpg' },
};

describe('caption', () => {
  const t = getTemplate('nk-cong-trinh')!;

  it('ba kênh: Facebook có hashtag, Zalo không hashtag, TikTok ngắn; luôn có SĐT người dùng nhập', () => {
    const [fb, zalo, tt] = buildCaptions(t, input);
    expect(fb!.channel).toBe('facebook');
    expect(fb!.text).toContain('Liên hệ: 0901 234 567');
    expect(fb!.hashtags).toContain('#NhômKínhHoàngGia');
    expect(fb!.text).toMatch(/#nhomkinh/);
    expect(zalo!.hashtags).toEqual([]);
    expect(zalo!.text).not.toContain('#');
    expect(tt!.text.split('\n\n')[0]!.split('\n').length).toBeLessThanOrEqual(4);
  });

  it('dòng có trường trống bị bỏ (không có "undefined" hay dòng rỗng giữa chừng)', () => {
    const [fb] = buildCaptions(t, { ...input, values: { ...input.values, detail: undefined, address: undefined } } as never);
    expect(fb!.text).not.toMatch(/Địa điểm|Địa chỉ|undefined|\{\{/);
  });

  it('dữ liệu sai thì ném TemplateInputError thay vì sinh caption', () => {
    expect(() => buildCaptions(t, { values: {}, photos: {} })).toThrowError(TemplateInputError);
  });

  it('mọi con số trong caption đến từ dữ liệu người dùng nhập, ở mọi mẫu và kênh', () => {
    for (const tpl of allTemplates()) {
      const values: Record<string, string> = {};
      for (const f of tpl.fields) values[f.key] = f.example;
      const photos: Record<string, string> = {};
      const captions: Record<string, string> = {};
      for (const p of tpl.photos) {
        photos[p.id] = `/p/${p.id}.jpg`;
        if (p.caption) captions[p.id] = p.caption.example;
      }
      const userText = [...Object.values(values), ...Object.values(captions)].join(' ');
      const userDigitRuns = new Set(userText.match(/\d+/g) ?? []);
      for (const c of buildCaptions(tpl, { values, photos, captions })) {
        for (const run of c.text.match(/\d+/g) ?? []) {
          expect(userDigitRuns.has(run) || /^0901234567$/.test(run.replace(/\s/g, '')), `${tpl.id}/${c.channel}: số "${run}" không từ dữ liệu nhập`).toBe(true);
        }
      }
    }
  });

  it('giới hạn độ dài theo kênh', () => {
    const long = { ...input, values: { ...input.values, itemName: 'x'.repeat(60), detail: 'y'.repeat(80) } };
    for (const c of buildCaptions(t, long)) expect([...c.text].length).toBeLessThanOrEqual(2200);
  });
});

describe('brandHashtag', () => {
  it('giữ dấu, CamelCase, bỏ ký tự lạ, ngắn quá thì bỏ', () => {
    expect(brandHashtag('Nhôm Kính Hoàng Gia')).toBe('#NhômKínhHoàngGia');
    expect(brandHashtag("Quán Cô Ba - 'Ngon' !!")).toBe('#QuánCôBaNgon');
    expect(brandHashtag('A')).toBeNull();
    expect([...brandHashtag('x'.repeat(80))!].length).toBeLessThanOrEqual(31);
  });
});
