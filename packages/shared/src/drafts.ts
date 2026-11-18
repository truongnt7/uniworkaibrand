import { z } from 'zod';

const shortText = z.string().max(2000);
const filePath = z.string().min(1).max(1024);

/** Nội dung form "Tạo video" của một bài: đủ để mở lại đúng chỗ đang làm dở (ảnh lưu bằng đường dẫn tệp). */
export const DraftForm = z
  .strictObject({
    industry: z.string().max(40).nullable().default(null),
    templateId: z.string().max(80).nullable().default(null),
    aspect: z.string().max(10).nullable().default(null),
    values: z.record(z.string().max(40), shortText).default({}),
    photos: z.record(z.string().max(80), filePath).default({}),
    captions: z.record(z.string().max(80), z.string().max(500)).default({}),
    logoPath: filePath.nullable().default(null),
    musicPath: filePath.nullable().default(null),
  })
  .refine((f) => Object.keys(f.values).length <= 40 && Object.keys(f.photos).length <= 16 && Object.keys(f.captions).length <= 16, { message: 'form quá lớn' });
export type DraftForm = z.infer<typeof DraftForm>;
export type DraftFormInput = z.input<typeof DraftForm>;

export const DRAFT_NAME_MAX = 120;

export const DraftSaveReq = z.strictObject({
  /** Bỏ trống = tạo bài mới. */
  id: z.string().min(1).max(64).optional(),
  name: z.string().max(DRAFT_NAME_MAX),
  form: DraftForm,
});
export type DraftSaveReq = z.input<typeof DraftSaveReq>;

export const DraftSummary = z.object({
  id: z.string(),
  name: z.string(),
  industry: z.string().nullable(),
  templateId: z.string().nullable(),
  photoCount: z.number().int().min(0),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type DraftSummary = z.infer<typeof DraftSummary>;

export const Draft = DraftSummary.extend({
  form: DraftForm,
  /** Đường dẫn ảnh/logo/nhạc của bài mà tệp không còn trên máy (đã xoá hoặc di chuyển). */
  missing: z.array(z.string()).default([]),
});
export type Draft = z.infer<typeof Draft>;
