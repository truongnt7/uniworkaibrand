import type { Aspect, Timeline } from '../timeline/schema.js';

export const DEFAULT_TEMPLATES = ['studio-soft', 'nature-soft', 'minimal-white', 'luxury-dark'] as const;

/** Ngữ cảnh app truyền cho Đạo diễn AI (khớp mục 3.2 kế hoạch). */
export interface DirectorContext {
  /** Mẫu cảnh khả dụng; AI chỉ được chọn trong danh sách này. */
  availableTemplates?: readonly string[];
  defaultAspect?: Aspect;
  /** Ghi đè thời lượng mặc định khi prompt không nêu. */
  defaultDurationS?: number;
  fps?: number;
  /** Sản phẩm có logo hay không; không có logo thì bỏ track logo. */
  hasLogo?: boolean;
  /** Kích thước SP (mm), chỉ làm ngữ cảnh cho LLM. */
  productSizeMm?: { width: number; depth: number; height: number };
}

export type DirectorSource = 'rules' | 'llm';

export interface DirectorResult {
  timeline: Timeline;
  source: DirectorSource;
  /** Cảnh báo cho UI (ví dụ chuyển động chưa hỗ trợ ở MVP). */
  warnings: string[];
  /** Chỉnh sửa tự động đã áp lên đầu ra LLM. */
  fixes: string[];
  /** Có khi LLM được thử nhưng phải về rule-based. */
  fallbackReason?: string;
}
