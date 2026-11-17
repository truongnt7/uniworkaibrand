import { describe, expect, it } from 'vitest';
import { createI18n, formatBytes, resources, translateError } from '../src/index.js';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? flatten(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('i18n', () => {
  it('vi và en có cùng tập khóa', () => {
    expect(flatten(resources.en.translation).sort()).toEqual(flatten(resources.vi.translation).sort());
  });

  it('mặc định là tiếng Việt, đổi locale không cần build lại', async () => {
    const i = createI18n();
    expect(i.t('status.done')).toBe('Hoàn tất');
    await i.changeLanguage('en');
    expect(i.t('status.done')).toBe('Done');
  });

  it('nội suy tham số', () => {
    expect(createI18n('vi').t('job.frames', { frame: 3, total: 10 })).toBe('3/10 khung');
  });

  it('dịch mã lỗi và rơi về UNKNOWN khi mã lạ', () => {
    const i = createI18n('vi');
    expect(translateError(i.t, 'CHECKSUM_MISMATCH')).toContain('checksum');
    expect(translateError(i.t, 'NOPE')).toBe(i.t('errors.UNKNOWN'));
  });

  it('định dạng dung lượng', () => {
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
  });
});
