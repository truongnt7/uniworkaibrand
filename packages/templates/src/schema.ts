import { z } from 'zod';
import {
  HexColor,
  SLIDESHOW_ASPECTS,
  SLIDE_MOTIONS,
  SLIDE_TEXT_POSITIONS,
  SLIDE_TEXT_STYLES,
  SLIDE_TRANSITIONS,
  slideshowDurationS,
} from '@aps/shared';

/**
 * Thư viện mẫu "ảnh sang video" theo ngành. Mọi mẫu là DỮ LIỆU (JSON) đã validate, không chứa mã.
 * Chuỗi tự do duy nhất trong mẫu là văn bản tiếng Việt hiển thị và các `{{trường}}` được điền từ dữ liệu người dùng nhập.
 */

export const INDUSTRIES = ['ban-hang-online', 'nha-hang', 'nhom-kinh', 'xay-dung', 'ngoai-ngu'] as const;
export const Industry = z.enum(INDUSTRIES);
export type Industry = z.infer<typeof Industry>;

export const INDUSTRY_LABELS: Record<Industry, string> = {
  'ban-hang-online': 'Bán hàng online',
  'nha-hang': 'Nhà hàng, quán ăn',
  'nhom-kinh': 'Nhôm kính',
  'xay-dung': 'Xây dựng, cải tạo',
  'ngoai-ngu': 'Trung tâm ngoại ngữ',
};

export const CHANNELS = ['facebook', 'zalo', 'tiktok'] as const;
export const Channel = z.enum(CHANNELS);
export type Channel = z.infer<typeof Channel>;

export const CHANNEL_LABELS: Record<Channel, string> = { facebook: 'Facebook', zalo: 'Zalo', tiktok: 'TikTok' };

export const Aspect = z.enum(SLIDESHOW_ASPECTS);
export type Aspect = z.infer<typeof Aspect>;

/** Tập trường dữ liệu cố định; mẫu chọn trường nào cần hỏi và đặt nhãn/gợi ý tiếng Việt riêng theo ngành. */
export const FIELD_KEYS = ['businessName', 'phone', 'address', 'itemName', 'price', 'promo', 'detail'] as const;
export const FieldKey = z.enum(FIELD_KEYS);
export type FieldKey = z.infer<typeof FieldKey>;

export const FIELD_MAX_CHARS: Record<FieldKey, number> = {
  businessName: 40,
  phone: 20,
  address: 100,
  itemName: 60,
  price: 40,
  promo: 60,
  detail: 80,
};

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'chỉ gồm chữ thường, số, dấu gạch ngang (tối đa 40 ký tự)');

export const FieldSpec = z.strictObject({
  key: FieldKey,
  label: z.string().min(1).max(60),
  hint: z.string().max(160).optional(),
  /** Ví dụ hiển thị mờ trong ô nhập; cũng dùng làm dữ liệu mẫu để test và xem thử. Không được là dữ liệu của khách thật. */
  example: z.string().min(1).max(FIELD_MAX_CHARS.address),
  required: z.boolean().default(false),
});
export type FieldSpec = z.infer<typeof FieldSpec>;

export const PhotoSlot = z.strictObject({
  id: slug,
  label: z.string().min(1).max(60),
  hint: z.string().max(160).optional(),
  required: z.boolean().default(false),
  /** Chú thích riêng cho ảnh này (ví dụ "Tên món - giá"); điền bằng `{{caption:<id>}}`. */
  caption: z
    .strictObject({
      label: z.string().min(1).max(60),
      example: z.string().min(1).max(60),
      maxChars: z.number().int().min(10).max(80).default(50),
    })
    .optional(),
});
export type PhotoSlot = z.infer<typeof PhotoSlot>;

const ColorRef = z.union([HexColor, z.enum(['primary', 'accent'])]);

export const TemplateText = z.strictObject({
  /** Có thể chứa `{{businessName}}`, `{{phone}}`..., `{{caption:<slot>}}`. Trường trống (không bắt buộc) => dòng chữ bị bỏ. */
  text: z.string().min(1).max(120),
  position: z.enum(SLIDE_TEXT_POSITIONS).default('bottom'),
  style: z.enum(SLIDE_TEXT_STYLES).default('body'),
  color: ColorRef.optional(),
  box: z.boolean().optional(),
  boxOpacity: z.number().min(0).max(1).optional(),
  t: z.number().min(0).max(20).optional(),
  tEnd: z.number().min(0).max(20).optional(),
});
export type TemplateText = z.infer<typeof TemplateText>;

const sceneCommon = {
  durationS: z.number().min(1).max(20),
  transition: z.enum(SLIDE_TRANSITIONS).optional(),
  transitionS: z.number().min(0.2).max(1.5).optional(),
  texts: z.array(TemplateText).max(4).default([]),
};

const motionCommon = {
  motion: z.enum(SLIDE_MOTIONS).optional(),
  zoom: z.number().min(0).max(0.3).optional(),
  shade: z.number().min(0).max(0.8).optional(),
};

export const TemplatePhotoScene = z.strictObject({
  type: z.literal('photo'),
  slot: slug,
  fit: z.enum(['cover', 'contain_blur']).optional(),
  ...motionCommon,
  ...sceneCommon,
});

export const TemplateCollageScene = z.strictObject({
  type: z.literal('collage'),
  /** 2–4 ô; ô nào không có ảnh bị bỏ, còn dưới 2 ảnh thì cả cảnh bị bỏ. */
  slots: z.array(slug).min(2).max(4),
  ...motionCommon,
  ...sceneCommon,
});

export const TemplateCardScene = z.strictObject({
  type: z.literal('card'),
  background: ColorRef.default('primary'),
  ...sceneCommon,
});

export const TemplateScene = z.discriminatedUnion('type', [TemplatePhotoScene, TemplateCollageScene, TemplateCardScene]);
export type TemplateScene = z.infer<typeof TemplateScene>;

export const GOALS = ['gioi-thieu', 'khuyen-mai', 'truoc-sau', 'thuc-don', 'tien-do', 'tuyen-sinh', 'tuyen-dung', 'bao-gia'] as const;
export const Goal = z.enum(GOALS);
export type Goal = z.infer<typeof Goal>;

export const TemplateCaption = z.strictObject({
  /** Mỗi dòng có thể chứa `{{trường}}`; dòng có trường trống bị bỏ. */
  lines: z.array(z.string().min(1).max(160)).min(1).max(8),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]{2,30}$/u)).max(5).default([]),
});
export type TemplateCaption = z.infer<typeof TemplateCaption>;

const PLACEHOLDER = /\{\{\s*([A-Za-z]+(?::[a-z0-9-]+)?)\s*\}\}/g;

export function extractPlaceholders(s: string): string[] {
  return [...s.matchAll(PLACEHOLDER)].map((m) => m[1]!);
}

export const Template = z
  .strictObject({
    id: slug,
    industry: Industry,
    name: z.string().min(2).max(60),
    summary: z.string().min(10).max(200),
    goal: Goal,
    /** `assumption` = chưa kiểm với khách thật (mọi mẫu hiện tại). Chỉ đổi sang `confirmed` sau khi khách dùng thử và xác nhận. */
    evidence: z.enum(['assumption', 'confirmed']),
    aspects: z.array(Aspect).min(1).max(4),
    defaultAspect: Aspect,
    channels: z.array(Channel).min(1).max(3),
    palette: z.strictObject({ primary: HexColor, accent: HexColor }),
    fields: z.array(FieldSpec).min(2).max(7),
    photos: z.array(PhotoSlot).max(8).default([]),
    scenes: z.array(TemplateScene).min(1).max(12),
    /** `end_card`: logo chỉ hiện ở cảnh cuối; `all`: logo hiện suốt video; `none`: không dùng logo. */
    logo: z.enum(['end_card', 'all', 'none']).default('end_card'),
    /** `optional`: người dùng có thể chọn tệp nhạc của họ. Chưa có thư viện nhạc bản quyền kèm theo. */
    music: z.enum(['none', 'optional']).default('optional'),
    caption: TemplateCaption,
  })
  .superRefine((t, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', message, path });
    const fieldKeys = new Set<string>(t.fields.map((f) => f.key));
    if (fieldKeys.size !== t.fields.length) issue(['fields'], 'trường bị khai báo trùng');
    for (const key of ['businessName', 'phone'] as const) {
      const f = t.fields.find((x) => x.key === key);
      if (!f) issue(['fields'], `thiếu trường bắt buộc "${key}" (mọi mẫu phải có tên cơ sở và số điện thoại)`);
      else if (!f.required) issue(['fields'], `trường "${key}" phải bắt buộc`);
    }
    const slotIds = new Set(t.photos.map((p) => p.id));
    if (slotIds.size !== t.photos.length) issue(['photos'], 'id ảnh bị trùng');
    if (!t.aspects.includes(t.defaultAspect)) issue(['defaultAspect'], 'defaultAspect phải nằm trong aspects');
    if (new Set(t.aspects).size !== t.aspects.length) issue(['aspects'], 'aspects bị trùng');

    const checkPlaceholders = (text: string, path: (string | number)[]) => {
      for (const ph of extractPlaceholders(text)) {
        if (ph.startsWith('caption:')) {
          const slot = t.photos.find((p) => p.id === ph.slice('caption:'.length));
          if (!slot) issue(path, `{{${ph}}}: không có ảnh "${ph.slice('caption:'.length)}"`);
          else if (!slot.caption) issue(path, `{{${ph}}}: ảnh "${slot.id}" không khai báo caption`);
        } else if (!(FIELD_KEYS as readonly string[]).includes(ph)) {
          issue(path, `{{${ph}}}: trường không tồn tại (chỉ dùng: ${FIELD_KEYS.join(', ')})`);
        } else if (!fieldKeys.has(ph)) {
          issue(path, `{{${ph}}}: mẫu dùng trường này nhưng không khai báo trong "fields"`);
        }
      }
      if (/\{\{|\}\}/.test(text.replace(PLACEHOLDER, ''))) issue(path, 'dấu {{ }} không hợp lệ');
    };

    t.scenes.forEach((s, i) => {
      if (s.type === 'photo' && !slotIds.has(s.slot)) issue(['scenes', i, 'slot'], `ảnh "${s.slot}" không được khai báo trong "photos"`);
      if (s.type === 'collage') s.slots.forEach((id) => !slotIds.has(id) && issue(['scenes', i, 'slots'], `ảnh "${id}" không được khai báo trong "photos"`));
      s.texts.forEach((tx, k) => {
        checkPlaceholders(tx.text, ['scenes', i, 'texts', k]);
        if (tx.tEnd !== undefined && tx.t !== undefined && tx.tEnd <= tx.t) issue(['scenes', i, 'texts', k], 'tEnd phải lớn hơn t');
      });
    });
    t.caption.lines.forEach((l, k) => checkPlaceholders(l, ['caption', 'lines', k]));

    const first = t.scenes[0]!;
    if (first.type === 'photo') {
      const slot = t.photos.find((p) => p.id === first.slot);
      if (slot && !slot.required) issue(['scenes', 0], 'cảnh đầu dùng ảnh không bắt buộc: có thể bị bỏ và làm lệch mẫu');
    }
    // Mọi ảnh bắt buộc phải xuất hiện trong ít nhất một cảnh, nếu không người dùng tải ảnh mà không thấy đâu.
    const used = new Set(t.scenes.flatMap((s) => (s.type === 'photo' ? [s.slot] : s.type === 'collage' ? s.slots : [])));
    t.photos.forEach((p, k) => !used.has(p.id) && issue(['photos', k], `ảnh "${p.id}" không được cảnh nào dùng`));

    const total = slideshowDurationS({
      scenes: t.scenes.map((s, i) => ({
        durationS: s.durationS,
        transition: i === 0 ? 'none' : (s.transition ?? 'fade'),
        transitionS: s.transitionS ?? 0.5,
      })),
    });
    if (total > 45) issue(['scenes'], `tổng thời lượng ${total.toFixed(1)} giây vượt 45 giây (video quảng cáo ngắn)`);
  });
export type Template = z.infer<typeof Template>;
export type TemplateInput = z.input<typeof Template>;

export const TemplateLibraryFile = z
  .strictObject({
    industry: Industry,
    templates: z.array(Template).min(3).max(12),
  })
  .superRefine((f, ctx) => {
    f.templates.forEach((t, i) => {
      if (t.industry !== f.industry) ctx.addIssue({ code: 'custom', message: `mẫu "${t.id}" thuộc ngành "${t.industry}" nhưng nằm trong tệp "${f.industry}"`, path: ['templates', i, 'industry'] });
    });
  });
export type TemplateLibraryFile = z.infer<typeof TemplateLibraryFile>;

export function templateLibraryJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(TemplateLibraryFile, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}
