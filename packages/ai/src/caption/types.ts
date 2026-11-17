import { z } from 'zod';

export const CHANNELS = ['facebook', 'instagram'] as const;
export const Channel = z.enum(CHANNELS);
export type Channel = z.infer<typeof Channel>;

export const BrandVoice = z.strictObject({
  name: z.string().trim().min(1).max(80),
  /** Giọng điệu: friendly (thân thiện), luxury (sang trọng), youthful (trẻ trung), expert (chuyên gia). */
  tone: z.enum(['friendly', 'luxury', 'youthful', 'expert']).default('friendly'),
  /** Cách xưng hô với khách: bạn / quý khách / các nàng-chàng... giữ ở 3 lựa chọn cố định. */
  address: z.enum(['ban', 'quy_khach', 'anh_chi']).default('ban'),
  emoji: z.enum(['none', 'light', 'rich']).default('light'),
  /** Câu/khẩu hiệu đặc trưng, chèn nguyên văn. */
  tagline: z.string().trim().max(120).optional(),
  forbiddenWords: z.array(z.string().trim().min(1).max(40)).max(50).default([]),
  baseHashtags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  /** Lời kêu gọi hành động riêng (ví dụ "Đặt hàng tại website"); không có sẽ dùng CTA mặc định theo kênh. */
  cta: z.string().trim().max(160).optional(),
});
export type BrandVoice = z.infer<typeof BrandVoice>;
export type BrandVoiceInput = z.input<typeof BrandVoice>;

export const ProductInfo = z.strictObject({
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().max(60).optional(),
  /** Điểm nổi bật do người dùng nhập; AI chỉ được dùng các ý này, không tự thêm công dụng/số liệu. */
  highlights: z.array(z.string().trim().min(1).max(120)).max(6).default([]),
  price: z.string().trim().max(40).optional(),
  promo: z.string().trim().max(120).optional(),
});
export type ProductInfo = z.infer<typeof ProductInfo>;
export type ProductInfoInput = z.input<typeof ProductInfo>;

export interface CaptionRequestInput {
  channel: Channel;
  brand: BrandVoiceInput;
  product: ProductInfoInput;
  /** Mô tả ngắn video/ảnh (ví dụ "Xoay 360 độ, kết thúc bằng logo"). */
  contentNote?: string;
}

export interface CaptionResult {
  channel: Channel;
  /** Nội dung bài đăng, chưa gồm hashtag. */
  caption: string;
  /** Hashtag có '#', không trùng, đã làm sạch. */
  hashtags: string[];
  /** Caption + hashtag, sẵn để sao chép. */
  text: string;
  source: 'template' | 'llm';
  warnings: string[];
  fallbackReason?: string;
}

export const CHANNEL_LIMITS: Record<Channel, { maxChars: number; hashtags: { min: number; max: number } }> = {
  facebook: { maxChars: 1200, hashtags: { min: 2, max: 5 } },
  instagram: { maxChars: 2200, hashtags: { min: 5, max: 15 } },
};
