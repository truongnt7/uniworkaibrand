import { AppError } from '@aps/shared';
import banHangOnline from './data/ban-hang-online.json' with { type: 'json' };
import nhaHang from './data/nha-hang.json' with { type: 'json' };
import nhomKinh from './data/nhom-kinh.json' with { type: 'json' };
import xayDung from './data/xay-dung.json' with { type: 'json' };
import ngoaiNgu from './data/ngoai-ngu.json' with { type: 'json' };
import { INDUSTRIES, TemplateLibraryFile, type Industry, type Template } from './schema.js';

const RAW: Record<Industry, unknown> = {
  'ban-hang-online': banHangOnline,
  'nha-hang': nhaHang,
  'nhom-kinh': nhomKinh,
  'xay-dung': xayDung,
  'ngoai-ngu': ngoaiNgu,
};

/** Nạp và validate toàn bộ thư viện. Mẫu sai schema làm hàm ném lỗi nêu rõ tệp/mẫu/trường (để test CI bắt được, không để lọt lên UI). */
export function parseLibraryFile(industry: Industry, raw: unknown): Template[] {
  const parsed = TemplateLibraryFile.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AppError('TEMPLATE_LIBRARY_INVALID', `Thư viện mẫu ngành "${industry}" không hợp lệ: ${detail}`);
  }
  if (parsed.data.industry !== industry) throw new AppError('TEMPLATE_LIBRARY_INVALID', `Tệp ngành "${industry}" khai báo nhầm ngành "${parsed.data.industry}"`);
  return parsed.data.templates;
}

let cache: Template[] | null = null;

export function allTemplates(): readonly Template[] {
  if (!cache) {
    const all = INDUSTRIES.flatMap((i) => parseLibraryFile(i, RAW[i]));
    const ids = new Set<string>();
    for (const t of all) {
      if (ids.has(t.id)) throw new AppError('TEMPLATE_LIBRARY_INVALID', `Trùng id mẫu: ${t.id}`);
      ids.add(t.id);
    }
    cache = all;
  }
  return cache;
}

export function templatesFor(industry: Industry): Template[] {
  return allTemplates().filter((t) => t.industry === industry);
}

export function getTemplate(id: string): Template | undefined {
  return allTemplates().find((t) => t.id === id);
}

export const RAW_LIBRARY: Readonly<Record<Industry, unknown>> = RAW;
