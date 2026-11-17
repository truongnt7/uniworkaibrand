import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CHANNEL_LIMITS, MockProvider, toHashtag, uniqueHashtags, writeCaption, type CaptionRequestInput } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(here, 'golden', 'caption');
const cases = JSON.parse(readFileSync(path.join(here, 'golden', 'caption-cases.json'), 'utf8')) as (CaptionRequestInput & { id: string })[];

describe('Caption offline (mẫu): golden', () => {
  mkdirSync(goldenDir, { recursive: true });
  for (const { id, ...input } of cases) {
    it(id, async () => {
      const r = await writeCaption(input);
      expect(r.source).toBe('template');
      expect(r.caption.length).toBeLessThanOrEqual(CHANNEL_LIMITS[input.channel].maxChars);
      expect(r.hashtags.length).toBeLessThanOrEqual(CHANNEL_LIMITS[input.channel].hashtags.max);
      expect(r.hashtags.every((h) => /^#[\p{L}\p{N}_]+$/u.test(h))).toBe(true);
      const actual = JSON.stringify({ input, result: r }, null, 2) + '\n';
      const file = path.join(goldenDir, `${id}.json`);
      if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
        if (process.env.CI) throw new Error(`Thiếu golden ${id}`);
        writeFileSync(file, actual);
      }
      expect(actual).toBe(readFileSync(file, 'utf8'));
    });
  }

  it('xác định và không chứa số liệu/công dụng ngoài dữ liệu vào', async () => {
    const input = cases[0]!;
    const a = await writeCaption(input);
    const b = await writeCaption(input);
    expect(a).toEqual(b);
    const digits = new Set(a.caption.match(/\d+/g));
    for (const d of digits) expect('Chai thủy tinh 30ml Kết cấu 299.000đ 360 Serum Vitamin C').toContain(d);
  });
});

describe('hashtag', () => {
  it('giữ chữ có dấu, bỏ ký tự thừa, trùng lặp', () => {
    expect(toHashtag('serum vitamin C')).toBe('#SerumVitaminC');
    expect(toHashtag('#Đẹp tự nhiên!')).toBe('#ĐẹpTựNhiên');
    expect(toHashtag('!!')).toBeUndefined();
    expect(toHashtag('2026')).toBeUndefined();
    expect(uniqueHashtags(['Lumi', '#lumi', 'LUMI', 'Beauty'], 5)).toEqual(['#Lumi', '#Beauty']);
  });
});

describe('Caption qua LLM + kiểm tra + fallback', () => {
  const input: CaptionRequestInput = {
    channel: 'instagram',
    brand: { name: 'Lumi Beauty', tone: 'friendly', forbiddenWords: ['số 1', 'rẻ nhất'], baseHashtags: ['LumiBeauty'] },
    product: { name: 'Serum Vitamin C', highlights: ['Chai 30ml'], price: '299.000đ' },
    contentNote: 'xoay 360 độ',
  };
  const good = JSON.stringify({
    caption: 'Serum Vitamin C chai 30ml từ Lumi Beauty, giá 299.000đ. Nhắn tin để được tư vấn nhé!',
    hashtags: ['#SerumVitaminC', 'duongda', 'LumiBeauty', 'skincare', 'mypham'],
  });

  it('chấp nhận đầu ra hợp lệ, gộp hashtag cố định, đưa dữ liệu vào prompt', async () => {
    const p = new MockProvider([good]);
    const r = await writeCaption(input, { provider: p });
    expect(r.source).toBe('llm');
    expect(r.hashtags).toContain('#LumiBeauty');
    expect(r.text).toContain(r.caption);
    expect(p.calls[0]!.system).toContain('KHÔNG bịa');
    expect(p.calls[0]!.user).toContain('Serum Vitamin C');
  });

  it.each([
    ['con số bịa', { caption: 'Serum giảm 90% nám sau 7 ngày, chai 30ml giá 299.000đ nhé các bạn', hashtags: [] }, 'Con số'],
    ['từ cấm', { caption: 'Serum Vitamin C số 1 thị trường, giá 299.000đ cho bạn', hashtags: [] }, 'từ bị cấm'],
    ['link bịa', { caption: 'Mua tại https://example.com serum Vitamin C chai 30ml nhé bạn ơi', hashtags: [] }, 'link'],
    ['quá dài', { caption: 'a'.repeat(2300), hashtags: [] }, 'dài'],
    ['khoá thừa', { caption: 'Serum Vitamin C chai 30ml xinh xắn', hashtags: [], extra: 1 }, 'schema'],
  ])('từ chối %s rồi fallback về mẫu', async (_n, bad, expected) => {
    const p = new MockProvider([JSON.stringify(bad), JSON.stringify(bad)]);
    const r = await writeCaption(input, { provider: p });
    expect(r.source).toBe('template');
    expect(r.fallbackReason?.toLowerCase()).toContain(expected.toLowerCase());
    expect(p.calls).toHaveLength(2);
  });

  it('thử lại 1 lần: lần 1 sai, lần 2 đúng', async () => {
    const p = new MockProvider(['không phải json', good]);
    const r = await writeCaption(input, { provider: p });
    expect(r.source).toBe('llm');
    expect(p.calls[1]!.user).toContain('bị từ chối');
  });

  it('lọc hashtag chứa từ cấm và giới hạn số lượng theo kênh', async () => {
    const many = JSON.stringify({ caption: 'Serum Vitamin C chai 30ml từ Lumi Beauty nhé bạn', hashtags: ['rẻ nhất', 'rẻ nhất ơi', ...Array.from({ length: 30 }, (_, i) => `tag${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`)] });
    const r = await writeCaption(input, { provider: new MockProvider([many]) });
    expect(r.source).toBe('llm');
    expect(r.hashtags.length).toBeLessThanOrEqual(CHANNEL_LIMITS.instagram.hashtags.max);
    expect(r.hashtags.join(' ').toLowerCase()).not.toContain('rẻnhất');
  });

  it('đầu vào sai schema bị từ chối trước khi gọi LLM', async () => {
    await expect(writeCaption({ ...input, brand: { name: '' } })).rejects.toThrow();
  });
});
