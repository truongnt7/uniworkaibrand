import { FIELD_MAX_CHARS, type FieldKey, type Template } from './schema.js';

/**
 * Kiểm tra dữ liệu người dùng nhập cho một mẫu. Thông báo là tiếng Việt dễ hiểu, nói rõ cách sửa.
 * Nguyên tắc: không tự "sửa" nội dung khách nhập (giá, SĐT chỉ định dạng lại cho dễ đọc), không tự thêm số liệu.
 */

export interface InputIssue {
  /** Khoá trường (`phone`), `photo:<slot>` hoặc `caption:<slot>`. */
  field: string;
  code:
    | 'required'
    | 'too_long'
    | 'phone_invalid'
    | 'price_ambiguous'
    | 'photo_missing'
    | 'photo_format'
    | 'photo_heic'
    | 'unknown_slot'
    | 'aspect_unsupported'
    | 'no_photo_scene';
  message: string;
}

export interface InputWarning {
  field: string;
  code: 'emoji_removed_in_video' | 'photo_optional_unused';
  message: string;
}

export type FieldValues = Partial<Record<FieldKey, string>>;

export interface TemplateUserInput {
  values: FieldValues;
  /** slot id -> đường dẫn ảnh. */
  photos: Record<string, string>;
  /** slot id -> chú thích riêng của ảnh. */
  captions?: Record<string, string>;
}

export interface NormalizedInput {
  values: Partial<Record<FieldKey, string>>;
  /** SĐT nguyên dạng đã chuẩn hoá (`0901234567`) để dùng cho liên kết/caption. */
  phoneDigits: string;
  photos: Record<string, string>;
  captions: Record<string, string>;
}

export type InputResult = { ok: true; input: NormalizedInput; warnings: InputWarning[] } | { ok: false; issues: InputIssue[] };

const EMOJI = /\p{Extended_Pictographic}|\u200d|\ufe0f|\u20e3/gu;
export const NBSP = '\u00a0';

function stripControl(s: string): string {
  return [...s].filter((ch) => {
    const c = ch.codePointAt(0)!;
    return c === 10 || c === 9 || (c >= 32 && c !== 127);
  }).join('');
}

export function cleanText(s: string): string {
  return stripControl(s.normalize('NFC')).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

/** Bỏ emoji khỏi chữ vẽ trực tiếp lên video (font video không có glyph emoji, sẽ hiện ô vuông). Caption vẫn giữ emoji. */
export function stripEmoji(s: string): string {
  return s.replace(EMOJI, '').replace(/ {2,}/g, ' ').trim();
}

/** Trả `digits` (bắt đầu bằng 0) nếu là SĐT Việt Nam hợp lệ: di động 10 số, bàn 11 số (02x), tổng đài 1800/1900. */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/[\s.\-()]/g, '');
  if (/^\+84/.test(d)) d = `0${d.slice(3)}`;
  else if (/^84\d{9,10}$/.test(d)) d = `0${d.slice(2)}`;
  if (!/^\d+$/.test(d)) return null;
  if (/^0[35789]\d{8}$/.test(d)) return d;
  if (/^02\d{9}$/.test(d)) return d;
  if (/^1[89]00\d{4,6}$/.test(d)) return d;
  return null;
}

export function formatPhone(digits: string): string {
  if (/^0\d{9}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (/^02\d{9}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  if (/^1[89]00/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return digits;
}

export type PriceResult = { ok: true; value: string } | { ok: false };

/**
 * Chỉ định dạng lại khi khách nhập thuần số ("199000" -> "199.000đ"). Chữ khách viết ("199k", "Liên hệ") được giữ nguyên.
 * Số trần dưới 1.000 bị từ chối vì mơ hồ (199 nghìn hay 199 đồng?), không đoán thay khách.
 */
export function normalizePrice(raw: string): PriceResult {
  const s = cleanText(raw);
  if (/^[\d.,\s]+$/.test(s) && /\d/.test(s)) {
    const digits = s.replace(/[^\d]/g, '');
    const n = Number(digits);
    if (!Number.isSafeInteger(n) || n < 1000) return { ok: false };
    return { ok: true, value: `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}đ` };
  }
  return { ok: true, value: s };
}

const PHOTO_EXT = ['.jpg', '.jpeg', '.png', '.webp'];

function extOf(p: string): string {
  const m = /\.[A-Za-z0-9]+$/.exec(p);
  return m ? m[0].toLowerCase() : '';
}

export function validateInput(template: Template, raw: TemplateUserInput, opts: { aspect?: string } = {}): InputResult {
  const issues: InputIssue[] = [];
  const warnings: InputWarning[] = [];
  const values: Partial<Record<FieldKey, string>> = {};
  let phoneDigits = '';

  for (const f of template.fields) {
    const v = cleanText(raw.values[f.key] ?? '');
    if (!v) {
      if (f.required) issues.push({ field: f.key, code: 'required', message: `Bạn chưa nhập "${f.label}". Hãy nhập để video có đủ thông tin cho khách liên hệ.` });
      continue;
    }
    const max = FIELD_MAX_CHARS[f.key];
    if ([...v].length > max) {
      issues.push({ field: f.key, code: 'too_long', message: `"${f.label}" dài quá ${max} ký tự (đang ${[...v].length}). Hãy viết ngắn lại để chữ trên video đọc được.` });
      continue;
    }
    if (f.key === 'phone') {
      const d = normalizePhone(v);
      if (!d) {
        issues.push({ field: 'phone', code: 'phone_invalid', message: 'Số điện thoại chưa đúng. Hãy nhập đủ 10 số, ví dụ 0901 234 567 (số bàn có mã vùng thì nhập đủ 11 số).' });
        continue;
      }
      phoneDigits = d;
      values.phone = formatPhone(d);
    } else if (f.key === 'price') {
      const p = normalizePrice(v);
      if (!p.ok) {
        issues.push({ field: 'price', code: 'price_ambiguous', message: `"${f.label}" chưa rõ đơn vị. Hãy ghi đủ, ví dụ 199.000đ hoặc 199k, để khách không hiểu nhầm.` });
        continue;
      }
      values.price = p.value;
    } else {
      values[f.key] = v;
    }
  }

  const slotIds = new Set(template.photos.map((p) => p.id));
  for (const id of Object.keys(raw.photos)) {
    if (!slotIds.has(id)) issues.push({ field: `photo:${id}`, code: 'unknown_slot', message: `Mẫu này không có chỗ cho ảnh "${id}".` });
  }
  const photos: Record<string, string> = {};
  const captions: Record<string, string> = {};
  for (const slot of template.photos) {
    const path = raw.photos[slot.id]?.trim();
    if (!path) {
      if (slot.required) issues.push({ field: `photo:${slot.id}`, code: 'photo_missing', message: `Hãy chọn ảnh cho "${slot.label}".` });
      continue;
    }
    const ext = extOf(path);
    if (ext === '.heic' || ext === '.heif') {
      issues.push({ field: `photo:${slot.id}`, code: 'photo_heic', message: `Ảnh "${slot.label}" ở định dạng HEIC (thường từ iPhone) chưa dùng được. Hãy chọn ảnh JPG, hoặc vào Cài đặt máy ảnh chọn "Tương thích nhất" rồi chụp lại.` });
      continue;
    }
    if (!PHOTO_EXT.includes(ext)) {
      issues.push({ field: `photo:${slot.id}`, code: 'photo_format', message: `Ảnh "${slot.label}" không đúng định dạng. Hãy chọn ảnh JPG, PNG hoặc WEBP.` });
      continue;
    }
    photos[slot.id] = path;
    const cap = cleanText(raw.captions?.[slot.id] ?? '');
    if (slot.caption && cap) {
      const max = slot.caption.maxChars;
      if ([...cap].length > max) issues.push({ field: `caption:${slot.id}`, code: 'too_long', message: `"${slot.caption.label}" dài quá ${max} ký tự (đang ${[...cap].length}). Hãy viết ngắn lại.` });
      else captions[slot.id] = cap;
    }
  }

  if (opts.aspect && !(template.aspects as readonly string[]).includes(opts.aspect)) {
    issues.push({ field: 'aspect', code: 'aspect_unsupported', message: `Mẫu này chưa hỗ trợ khung hình ${opts.aspect}. Hãy chọn: ${template.aspects.join(', ')}.` });
  }

  const hasPhotoScene = template.scenes.some((s) => s.type === 'card' || (s.type === 'photo' ? photos[s.slot] : s.slots.filter((x) => photos[x]).length >= 2));
  if (!hasPhotoScene) issues.push({ field: 'photo', code: 'no_photo_scene', message: 'Chưa đủ ảnh để dựng video. Hãy thêm ảnh theo hướng dẫn của mẫu.' });

  if (issues.length) return { ok: false, issues };

  for (const [key, v] of Object.entries(values)) {
    if (stripEmoji(v) !== v) {
      const f = template.fields.find((x) => x.key === key);
      warnings.push({ field: key, code: 'emoji_removed_in_video', message: `"${f?.label ?? key}" có biểu tượng cảm xúc (emoji): video không vẽ được emoji nên sẽ bỏ khỏi hình, nhưng vẫn giữ trong caption.` });
    }
  }
  return { ok: true, input: { values, phoneDigits, photos, captions }, warnings };
}
