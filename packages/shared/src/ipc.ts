import { z } from 'zod';
import { JobRecord, JobTarget, ProductSpec, RenderDevice, RenderEngine, RenderRequest, SlideshowCreateReq, TimelineExtras } from './job.js';
import { HexColor } from './overlay.js';
import { RuntimeProgress, RuntimeStatus } from './runtime.js';

const Empty = z.object({}).strict();
const IdPayload = z.object({ id: z.string().min(1) });

/**
 * Prompt tiếng Việt -> Đạo diễn AI (chạy ở orchestrator, khóa LLM không bao giờ tới renderer) -> timeline -> job v2 -> render -> mp4.
 * Phản hồi chỉ có kết quả Đạo diễn (nguồn, cảnh báo), không có cấu hình/khóa nhà cung cấp.
 */
export const CreateFromPromptReq = z.object({
  prompt: z.string().trim().min(1).max(2000),
  /** `cloud` được nhận để hàng đợi sẵn sàng cho V1 nhưng chưa chạy được (UI chỉ hiện "sắp có"). */
  target: JobTarget.default('local'),
  name: z.string().trim().min(1).max(120).optional(),
  product: ProductSpec,
  logoPath: z.string().min(1).optional(),
  /** Mẫu cảnh khả dụng cho Đạo diễn; mặc định là danh sách worker hỗ trợ. */
  availableTemplates: z.array(z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/)).max(32).optional(),
  render: z
    .object({
      engine: RenderEngine.optional(),
      samples: z.number().int().min(1).max(4096).optional(),
      device: RenderDevice.optional(),
      /** Cạnh ngắn của video (px), mặc định 720. */
      shortSide: z.number().int().min(144).max(2160).optional(),
      /** fps mặc định của Đạo diễn khi prompt không nêu (15–60). */
      fps: z.number().int().min(15).max(60).optional(),
    })
    .optional(),
  extras: TimelineExtras.optional(),
});
export type CreateFromPromptReq = z.infer<typeof CreateFromPromptReq>;

export const DirectorInfo = z.object({
  source: z.enum(['rules', 'llm']),
  warnings: z.array(z.string()),
  fixes: z.array(z.string()),
  fallbackReason: z.string().optional(),
});
export type DirectorInfo = z.infer<typeof DirectorInfo>;

export const InputIssue = z.object({
  field: z.string(),
  code: z.string(),
  message: z.string(),
});
export type InputIssue = z.infer<typeof InputIssue>;

export const SlideshowValidateRes = z.object({
  ok: z.boolean(),
  issues: z.array(InputIssue),
  warnings: z.array(InputIssue),
});
export type SlideshowValidateRes = z.infer<typeof SlideshowValidateRes>;

export const SlideshowCaptionReq = SlideshowCreateReq.pick({ templateId: true, input: true });
export const CaptionResult = z.object({
  channel: z.enum(['facebook', 'zalo', 'tiktok']),
  text: z.string(),
  hashtags: z.array(z.string()),
});
export type CaptionResult = z.infer<typeof CaptionResult>;

/** Thông tin doanh nghiệp được nhớ để lần sau không phải nhập lại. Mọi trường tuỳ chọn; SĐT/địa chỉ chỉ được kiểm khi tạo video. */
export const BusinessProfile = z.strictObject({
  businessName: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(20).optional(),
  address: z.string().trim().max(100).optional(),
  /** Logo đã được sao chép vào thư mục dữ liệu của app (không phụ thuộc tệp gốc). */
  logoPath: z.string().max(1024).optional(),
  brandColor: HexColor.optional(),
  industry: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
  templateId: z.string().regex(/^[a-z0-9-]{1,40}$/).optional(),
});
export type BusinessProfile = z.infer<typeof BusinessProfile>;

/** `null` ở một trường = xoá trường đó. */
export const BusinessProfilePatch = z.strictObject({
  businessName: BusinessProfile.shape.businessName.nullable(),
  phone: BusinessProfile.shape.phone.nullable(),
  address: BusinessProfile.shape.address.nullable(),
  logoPath: BusinessProfile.shape.logoPath.nullable(),
  brandColor: BusinessProfile.shape.brandColor.nullable(),
  industry: BusinessProfile.shape.industry.nullable(),
  templateId: BusinessProfile.shape.templateId.nullable(),
}).partial();
export type BusinessProfilePatch = z.infer<typeof BusinessProfilePatch>;

/** Hợp đồng IPC duy nhất giữa renderer <-> main <-> orchestrator (schema zod dùng chung). */
export const invokeContract = {
  'jobs:list': { req: Empty, res: z.array(JobRecord) },
  'jobs:create': { req: RenderRequest, res: JobRecord },
  'jobs:createFromPrompt': { req: CreateFromPromptReq, res: z.object({ job: JobRecord, director: DirectorInfo }) },
  'slideshow:validate': { req: SlideshowCreateReq, res: SlideshowValidateRes },
  'slideshow:create': { req: SlideshowCreateReq, res: z.object({ job: JobRecord, warnings: z.array(InputIssue) }) },
  'slideshow:caption': { req: SlideshowCaptionReq, res: z.array(CaptionResult) },
  'profile:get': { req: Empty, res: BusinessProfile },
  'profile:set': { req: BusinessProfilePatch, res: BusinessProfile },
  'jobs:cancel': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'jobs:retry': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'jobs:pause': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'jobs:resume': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'jobs:remove': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'runtime:status': { req: Empty, res: RuntimeStatus },
  'runtime:install': { req: Empty, res: RuntimeStatus },
  'runtime:importFile': { req: z.object({ path: z.string().min(1) }), res: RuntimeStatus },
  'dialog:pickFile': {
    req: z.object({ kind: z.enum(['glb', 'image', 'runtime', 'photo', 'logo', 'audio']) }),
    res: z.object({ path: z.string().nullable() }),
  },
  /** Hộp thoại lưu của hệ điều hành rồi chép mp4 của job đã xong tới nơi người dùng chọn. */
  'video:save': {
    req: z.object({ jobId: z.string().min(1), suggestedName: z.string().trim().min(1).max(120).optional() }),
    res: z.object({ path: z.string().nullable() }),
  },
  /** Mở thư mục chứa tệp đã lưu hoặc kết quả của job. */
  'video:reveal': { req: z.object({ jobId: z.string().min(1).optional(), path: z.string().min(1).max(1024).optional() }), res: z.object({ ok: z.boolean() }) },
  'clipboard:writeText': { req: z.object({ text: z.string().max(10_000) }), res: z.object({ ok: z.boolean() }) },
  /** Hình thu nhỏ để hiện ảnh người dùng vừa chọn (ảnh nằm ngoài thư mục app nên renderer không đọc trực tiếp được). */
  'photo:thumbnail': {
    req: z.object({ path: z.string().min(1).max(1024), maxSide: z.number().int().min(32).max(640).default(240) }),
    res: z.object({ dataUrl: z.string().nullable(), width: z.number().int().nullable(), height: z.number().int().nullable() }),
  },
  'app:info': {
    req: Empty,
    res: z.object({ version: z.string(), platform: z.string(), dataDir: z.string() }),
  },
} as const;

export const eventContract = {
  'jobs:changed': JobRecord,
  'runtime:progress': RuntimeProgress,
} as const;

export type InvokeChannel = keyof typeof invokeContract;
export type EventChannel = keyof typeof eventContract;
export type InvokeReq<C extends InvokeChannel> = z.input<(typeof invokeContract)[C]['req']>;
export type InvokeRes<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['res']>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventContract)[C]>;


export class IpcValidationError extends Error {
  readonly code = 'IPC_INVALID_PAYLOAD';
  constructor(
    readonly channel: string,
    detail: string,
  ) {
    super(`IPC ${channel}: ${detail}`);
  }
}

export type InvokeHandlers = {
  [C in InvokeChannel]?: (req: z.output<(typeof invokeContract)[C]['req']>) => Promise<InvokeRes<C>> | InvokeRes<C>;
};

/**
 * Kiểm tra kênh + schema rồi gọi handler. Dùng ở main (và orchestrator) cho mọi yêu cầu từ renderer.
 * Kênh lạ hoặc payload sai schema bị từ chối trước khi chạm vào logic.
 */
export async function dispatchInvoke(handlers: InvokeHandlers, channel: unknown, payload: unknown): Promise<unknown> {
  if (typeof channel !== 'string' || !Object.hasOwn(invokeContract, channel)) {
    throw new IpcValidationError(String(channel), 'unknown channel');
  }
  const ch = channel as InvokeChannel;
  const parsed = invokeContract[ch].req.safeParse(payload ?? {});
  if (!parsed.success) {
    throw new IpcValidationError(ch, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  const handler = handlers[ch] as ((req: unknown) => unknown) | undefined;
  if (!handler) throw new IpcValidationError(ch, 'no handler');
  return handler(parsed.data);
}
