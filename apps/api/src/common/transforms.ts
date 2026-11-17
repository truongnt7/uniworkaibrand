import { Transform } from 'class-transformer';

export const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export const ToBoolean = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  });

/** Chuẩn hóa mảng thẻ: trim, bỏ rỗng, bỏ trùng (không phân biệt hoa thường). */
export const NormalizeTags = () =>
  Transform(({ value }: { value: unknown }) => {
    if (!Array.isArray(value)) return value;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const v of value) {
      if (typeof v !== 'string') return value;
      const t = v.trim();
      const k = t.toLowerCase();
      if (t && !seen.has(k)) {
        seen.add(k);
        out.push(t);
      }
    }
    return out;
  });
