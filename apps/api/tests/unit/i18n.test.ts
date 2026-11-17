import { describe, expect, it } from 'vitest';
import { ERROR_CODES_EN, ERROR_CODES_VI, resolveLocale, translateError, translateValidation } from '../../src/i18n/messages';

describe('i18n lỗi', () => {
  it('mọi mã lỗi có đủ bản vi và en', () => {
    expect([...ERROR_CODES_VI].sort()).toEqual([...ERROR_CODES_EN].sort());
  });

  it('nội suy tham số và rơi về UNKNOWN khi mã lạ', () => {
    expect(translateError('vi', 'PRODUCT_SKU_TAKEN', { sku: 'A-1' })).toBe('SKU A-1 đã tồn tại trong workspace');
    expect(translateError('en', 'PRODUCT_SKU_TAKEN', { sku: 'A-1' })).toBe('SKU A-1 already exists in this workspace');
    expect(translateError('vi', 'NO_SUCH_CODE')).toBe('Đã xảy ra lỗi không xác định');
    expect(translateError('en', 'CREDIT_INSUFFICIENT')).toContain('{balance}');
  });

  it('thông điệp validation theo ràng buộc, mặc định chung khi ràng buộc lạ', () => {
    expect(translateValidation('vi', 'isEmail', 'email')).toBe('email phải là email hợp lệ');
    expect(translateValidation('en', 'isEmail', 'email')).toBe('email must be a valid email');
    expect(translateValidation('vi', 'weirdRule', 'x')).toBe('x không hợp lệ');
  });

  it('resolveLocale: mặc định vi, tôn trọng q-value, bỏ qua q=0 và ngôn ngữ không hỗ trợ', () => {
    expect(resolveLocale(undefined)).toBe('vi');
    expect(resolveLocale('')).toBe('vi');
    expect(resolveLocale('en-GB')).toBe('en');
    expect(resolveLocale('fr, en;q=0.5')).toBe('en');
    expect(resolveLocale('en;q=0.4, vi;q=0.8')).toBe('vi');
    expect(resolveLocale('en;q=0, fr')).toBe('vi');
    expect(resolveLocale('xx', 'en')).toBe('en');
    expect(resolveLocale('en;q=abc')).toBe('vi');
  });
});
