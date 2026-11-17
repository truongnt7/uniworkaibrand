import { TemplateInputError, fillPlaceholders } from './compile.js';
import { validateInput, type NormalizedInput, type TemplateUserInput } from './inputs.js';
import { CHANNELS, type Channel, type Template } from './schema.js';

export interface TemplateCaptionResult {
  channel: Channel;
  /** Nội dung sẵn để dán (đã gồm hashtag nếu kênh dùng hashtag). */
  text: string;
  hashtags: string[];
}

/**
 * Giới hạn theo kênh. Zalo: GIẢ ĐỊNH là không dùng hashtag (cần xác nhận với khách); TikTok: ngắn gọn.
 * Mọi con số trong caption đến từ dữ liệu người dùng nhập; mẫu không chứa chữ số (có test).
 */
const CHANNEL_RULES: Record<Channel, { maxLines: number; maxHashtags: number; maxChars: number }> = {
  facebook: { maxLines: 8, maxHashtags: 5, maxChars: 1200 },
  zalo: { maxLines: 8, maxHashtags: 0, maxChars: 1200 },
  tiktok: { maxLines: 4, maxHashtags: 5, maxChars: 2200 },
};

/** `Nhôm Kính Hoàng Gia` -> `#NhômKínhHoàngGia` (giữ dấu tiếng Việt, bỏ ký tự lạ, tối đa 30 ký tự). */
export function brandHashtag(businessName: string): string | null {
  const words = businessName.normalize('NFC').split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const tag = words.map((w) => w.charAt(0).toLocaleUpperCase('vi') + w.slice(1)).join('').slice(0, 30);
  return [...tag].length >= 3 ? `#${tag}` : null;
}

export function buildCaptionFromInput(template: Template, input: NormalizedInput, channel: Channel): TemplateCaptionResult {
  const rule = CHANNEL_RULES[channel];
  const lines: string[] = [];
  for (const l of template.caption.lines) {
    const filled = fillPlaceholders(l, input, 'caption');
    if (filled !== null) lines.push(filled);
  }
  const body = lines.slice(0, rule.maxLines);
  const tags: string[] = [];
  const brand = input.values.businessName ? brandHashtag(input.values.businessName) : null;
  for (const h of [...template.caption.hashtags, ...(brand ? [brand] : [])]) {
    if (!tags.some((x) => x.toLocaleLowerCase('vi') === h.toLocaleLowerCase('vi'))) tags.push(h);
  }
  const hashtags = rule.maxHashtags === 0 ? [] : tags.slice(0, rule.maxHashtags);
  let text = body.join('\n');
  if (hashtags.length) text = `${text}\n\n${hashtags.join(' ')}`;
  if ([...text].length > rule.maxChars) text = [...text].slice(0, rule.maxChars).join('');
  return { channel, text, hashtags };
}

/** Caption cho các kênh của mẫu (hoặc danh sách kênh chỉ định). Ném `TemplateInputError` nếu dữ liệu chưa hợp lệ. */
export function buildCaptions(template: Template, user: TemplateUserInput, channels: readonly Channel[] = template.channels): TemplateCaptionResult[] {
  const checked = validateInput(template, user);
  if (!checked.ok) throw new TemplateInputError(checked.issues);
  return channels.filter((c) => (CHANNELS as readonly string[]).includes(c)).map((c) => buildCaptionFromInput(template, checked.input, c));
}
