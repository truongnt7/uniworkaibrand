import { uniqueHashtags } from './hashtags.js';
import { CHANNEL_LIMITS, type BrandVoice, type Channel, type ProductInfo } from './types.js';

/** Hash xác định (FNV-1a) để chọn biến thể mẫu ổn định theo sản phẩm + kênh, không dùng ngẫu nhiên. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const YOU = { ban: 'bạn', quy_khach: 'quý khách', anh_chi: 'anh/chị' } as const;
const SELF = { ban: 'mình', quy_khach: 'chúng tôi', anh_chi: 'chúng em' } as const;

const EMOJI: Record<BrandVoice['tone'], { hook: string; point: string; cta: string }> = {
  friendly: { hook: '✨', point: '💛', cta: '👉' },
  luxury: { hook: '✦', point: '◆', cta: '➤' },
  youthful: { hook: '🔥', point: '💥', cta: '👉' },
  expert: { hook: '🔎', point: '✔️', cta: '📩' },
};

type Ctx = { you: string; self: string; brand: string; name: string };

const HOOKS: Record<BrandVoice['tone'], ((c: Ctx) => string)[]> = {
  friendly: [
    (c) => `${c.name} đã sẵn sàng đồng hành cùng ${c.you} mỗi ngày.`,
    (c) => `Gặp gỡ ${c.name} từ ${c.brand}: nhỏ gọn, dễ dùng, dễ yêu.`,
    (c) => `${c.self[0]!.toUpperCase()}${c.self.slice(1)} xin giới thiệu ${c.name} đến ${c.you}.`,
  ],
  luxury: [
    (c) => `${c.name}: tinh tế trong từng chi tiết, dành cho ${c.you}.`,
    (c) => `${c.brand} trân trọng giới thiệu ${c.name}.`,
    (c) => `Đẳng cấp được thể hiện qua sự chọn lọc. ${c.name} từ ${c.brand}.`,
  ],
  youthful: [
    (c) => `Chốt đơn ngay ${c.name} thôi nào!`,
    (c) => `${c.name} xuất hiện rồi đây, ${c.you} đã thấy chưa?`,
    (c) => `Làm mới ngày của ${c.you} cùng ${c.name} từ ${c.brand}.`,
  ],
  expert: [
    (c) => `Giới thiệu ${c.name} từ ${c.brand}.`,
    (c) => `${c.name}: những điểm cần biết trước khi ${c.you} chọn.`,
    (c) => `${c.brand} chia sẻ về ${c.name}.`,
  ],
};

const DEFAULT_CTA: Record<Channel, (c: Ctx) => string> = {
  facebook: (c) => `Nhắn tin cho ${c.brand} để được tư vấn chi tiết nhé.`,
  instagram: (c) => `Nhắn tin (DM) cho ${c.brand} để được tư vấn nhé.`,
};

export interface TemplateOutput {
  caption: string;
  hashtags: string[];
}

export function captionFromTemplate(channel: Channel, brand: BrandVoice, product: ProductInfo, note?: string): TemplateOutput {
  const you = YOU[brand.address];
  const self = SELF[brand.address];
  const ctx: Ctx = { you, self, brand: brand.name, name: product.name };
  const variants = HOOKS[brand.tone];
  const hook = variants[hash(`${product.name}|${channel}`) % variants.length]!(ctx);
  const e = brand.emoji === 'none' ? null : EMOJI[brand.tone];
  const rich = brand.emoji === 'rich';
  const lines: string[] = [];
  lines.push(e ? `${e.hook} ${hook}` : hook);

  if (note) lines.push(note.endsWith('.') ? note : `${note}.`);
  if (product.highlights.length > 0) {
    lines.push('');
    for (const h of product.highlights) lines.push(e ? `${e.point} ${h}` : `• ${h}`);
  }
  if (product.promo) lines.push('', e && rich ? `🎁 ${product.promo}` : product.promo);
  if (product.price) lines.push(`Giá: ${product.price}`);
  if (brand.tagline) lines.push('', brand.tagline);
  const cta = brand.cta ?? DEFAULT_CTA[channel](ctx);
  lines.push('', e ? `${e.cta} ${cta}` : cta);

  let caption = lines.join('\n');
  const max = CHANNEL_LIMITS[channel].maxChars;
  if (caption.length > max) caption = `${caption.slice(0, max - 1).trimEnd()}…`;

  const lim = CHANNEL_LIMITS[channel].hashtags;
  const pool = [
    ...brand.baseHashtags,
    product.name,
    brand.name,
    ...(product.category ? [product.category] : []),
    ...(channel === 'instagram'
      ? ['sản phẩm đẹp', 'review sản phẩm', 'mua sắm online', 'shop việt nam', 'video 3D', 'xu hướng', 'quảng cáo sản phẩm']
      : ['sản phẩm chất lượng', 'mua sắm online']),
  ];
  const hashtags = uniqueHashtags(pool, lim.max);
  return { caption, hashtags };
}
