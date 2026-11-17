import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'fonts');

/** Đọc bảng cmap (định dạng 4, đủ cho tiếng Việt vì mọi ký tự nằm trong BMP) và trả tập mã ký tự có glyph. */
function cmapCodepoints(file: string): Set<number> {
  const b = readFileSync(file);
  const tables = b.readUInt16BE(4);
  let cmapOff = -1;
  for (let i = 0; i < tables; i++) {
    const rec = 12 + i * 16;
    if (b.toString('ascii', rec, rec + 4) === 'cmap') cmapOff = b.readUInt32BE(rec + 8);
  }
  const subs = b.readUInt16BE(cmapOff + 2);
  const out = new Set<number>();
  for (let i = 0; i < subs; i++) {
    const off = cmapOff + b.readUInt32BE(cmapOff + 4 + i * 8 + 4);
    if (b.readUInt16BE(off) !== 4) continue;
    const segX2 = b.readUInt16BE(off + 6);
    const endO = off + 14;
    const startO = endO + segX2 + 2;
    for (let s = 0; s < segX2 / 2; s++) {
      const end = b.readUInt16BE(endO + s * 2);
      const start = b.readUInt16BE(startO + s * 2);
      for (let c = start; c <= end && c < 0xffff; c++) out.add(c);
    }
  }
  return out;
}

const VI_LOWER = 'aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵđ';
const VI_ALL = VI_LOWER + VI_LOWER.toLocaleUpperCase('vi');

describe('phông tiếng Việt đi kèm app (Be Vietnam Pro, SIL OFL 1.1)', () => {
  it.each(['BeVietnamPro-Regular.ttf', 'BeVietnamPro-SemiBold.ttf', 'BeVietnamPro-Bold.ttf'])('%s có đủ chữ cái và dấu tiếng Việt', (name) => {
    const have = cmapCodepoints(join(dir, name));
    const missing = [...VI_ALL].filter((ch) => !have.has(ch.codePointAt(0)!));
    expect(missing).toEqual([]);
    for (const ch of '0123456789.,:;-+%đ₫/()@#!?') expect(have.has(ch.codePointAt(0)!), ch).toBe(true);
  });

  it('có kèm văn bản giấy phép OFL 1.1', () => {
    const ofl = readFileSync(join(dir, 'OFL.txt'), 'utf8');
    expect(ofl).toMatch(/SIL OPEN FONT LICENSE Version 1\.1/);
    expect(ofl).toMatch(/Be Vietnam Pro Project Authors/);
  });
});
