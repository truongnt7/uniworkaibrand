import { z } from 'zod';
import { LabelSpec, RenderDevice, RenderEngine, MotionKind, SizeMm } from './job.js';
import { Ease, HexColor, LogoOverlay, TextOverlay } from './overlay.js';

/**
 * Đầu vào của blender-worker: file job.json do orchestrator ghi.
 * `version` là bắt buộc: 1 = một chuyển động toàn đoạn (PoC, ảnh/xoay 360), 2 = timeline nhiều track đã biên dịch.
 * Worker Python (blender-worker/job.py) kiểm tra lại cả hai phiên bản; đổi schema phải đổi `version`.
 */
export const WorkerJobV1 = z.object({
  version: z.literal(1),
  mode: z.enum(['render', 'smoke']),
  jobId: z.string(),
  /** Chỉ dùng cho QC nhãn: worker ghi `<khung>.png.grid.json` (lưới chiếu nhãn) cạnh mỗi khung. */
  qcGrid: z.boolean().optional(),
  product: z
    .object({
      glbPath: z.string(),
      sizeMm: SizeMm.optional(),
      label: LabelSpec.optional(),
    })
    .optional(),
  scene: z.object({
    template: z.literal('studio-soft'),
    backgroundColor: HexColor,
    shadow: z.number().min(0).max(1),
  }),
  motion: MotionKind,
  render: z.object({
    engine: RenderEngine,
    samples: z.number().int().min(1),
    width: z.number().int().min(16),
    height: z.number().int().min(16),
    device: RenderDevice,
  }),
  frames: z.object({
    total: z.number().int().min(1),
    angleStartDeg: z.number(),
    angleSpanDeg: z.number(),
  }),
  paths: z.object({
    framesDir: z.string(),
    pattern: z.string().default('frame_%06d.png'),
  }),
  limits: z
    .object({
      maxGlbBytes: z.number().int().positive(),
      maxTriangles: z.number().int().positive(),
    })
    .default({ maxGlbBytes: 200 * 1024 * 1024, maxTriangles: 2_000_000 }),
});
export type WorkerJobV1 = z.infer<typeof WorkerJobV1>;
export type WorkerJobInput = z.input<typeof WorkerJobV1>;

export const SCENE_TEMPLATES = ['studio-soft', 'nature-soft', 'minimal-white', 'luxury-dark'] as const;
export const SceneTemplate = z.enum(SCENE_TEMPLATES);
export type SceneTemplate = z.infer<typeof SceneTemplate>;

export const SCENE_HIDE_ITEMS = ['platform'] as const;

/** `ease` mô tả cách nội suy từ keyframe này tới keyframe kế tiếp; trước keyframe đầu và sau keyframe cuối giữ nguyên giá trị. */
export const Keyframe = z.strictObject({
  t: z.number().min(0).max(3600),
  v: z.number().min(-1e6).max(1e6),
  ease: Ease.default('smooth'),
});
export type Keyframe = z.infer<typeof Keyframe>;

export const KeyTrack = z
  .array(Keyframe)
  .min(1)
  .max(128)
  .superRefine((kfs, ctx) => {
    for (let i = 1; i < kfs.length; i++) {
      if (kfs[i]!.t <= kfs[i - 1]!.t) {
        ctx.addIssue({ code: 'custom', message: `keyframe[${i}].t phải lớn hơn keyframe trước`, path: [i, 't'] });
      }
    }
  });
export type KeyTrack = z.infer<typeof KeyTrack>;

export const WORKER_JOB_V2_VERSION = 2 as const;

/** Job v2: timeline nhiều track đã biên dịch thành keyframe số (không có mã, không có chuỗi tự do ngoài chữ hiển thị). */
export const WorkerJobV2 = z
  .strictObject({
    version: z.literal(WORKER_JOB_V2_VERSION),
    mode: z.literal('render'),
    jobId: z.string(),
    qcGrid: z.boolean().optional(),
    product: z.strictObject({
      glbPath: z.string(),
      sizeMm: SizeMm.optional(),
      label: LabelSpec.optional(),
      /** Nhãn luôn được dán lại bằng decal từ ảnh gốc; không có đường nào bỏ nhãn khi `true`. */
      lockLabel: z.boolean().default(true),
    }),
    scene: z.strictObject({
      template: SceneTemplate,
      backgroundColor: HexColor,
      shadow: z.number().min(0).max(1),
      hide: z.array(z.enum(SCENE_HIDE_ITEMS)).max(SCENE_HIDE_ITEMS.length).default([]),
    }),
    render: z.strictObject({
      engine: RenderEngine,
      samples: z.number().int().min(1),
      width: z.number().int().min(16),
      height: z.number().int().min(16),
      device: RenderDevice,
    }),
    frames: z.strictObject({
      total: z.number().int().min(1),
      fps: z.number().int().min(1).max(60),
    }),
    tracks: z.strictObject({
      /** Góc xoay sản phẩm quanh trục Z (độ). */
      product: z.strictObject({ rotZDeg: KeyTrack }),
      /** Camera: góc quay quanh sản phẩm (độ), góc nâng (độ), hệ số khoảng cách (1 = khung chuẩn). */
      camera: z.strictObject({ azimuthDeg: KeyTrack, elevationDeg: KeyTrack, distanceScale: KeyTrack }),
      /** Ánh sáng: hệ số công suất đèn chính/phụ/viền và góc quay đèn chính quanh sản phẩm (độ). */
      light: z.strictObject({ keyScale: KeyTrack, fillScale: KeyTrack, rimScale: KeyTrack, keyAzimuthDeg: KeyTrack }),
    }),
    overlays: z
      .strictObject({
        logo: z.array(LogoOverlay).max(2).default([]),
        text: z.array(TextOverlay).max(4).default([]),
      })
      .prefault({}),
    paths: z.object({
      framesDir: z.string(),
      pattern: z.string().default('frame_%06d.png'),
    }),
    limits: z
      .object({
        maxGlbBytes: z.number().int().positive(),
        maxTriangles: z.number().int().positive(),
      })
      .default({ maxGlbBytes: 200 * 1024 * 1024, maxTriangles: 2_000_000 }),
  })
  .superRefine((job, ctx) => {
    for (const kind of ['logo', 'text'] as const) {
      job.overlays[kind].forEach((o, i) => {
        if (o.tEnd <= o.t) ctx.addIssue({ code: 'custom', message: 'tEnd phải lớn hơn t', path: ['overlays', kind, i, 'tEnd'] });
      });
    }
  });
export type WorkerJobV2 = z.infer<typeof WorkerJobV2>;
export type WorkerJobV2Input = z.input<typeof WorkerJobV2>;

/** Điểm vào chung: chọn schema theo `version`; version lạ bị từ chối. */
export const WorkerJob = z.discriminatedUnion('version', [WorkerJobV1, WorkerJobV2]);
export type WorkerJob = z.infer<typeof WorkerJob>;

export const WORKER_ERROR_CODES = [
  'INVALID_JOB',
  'GLB_NOT_FOUND',
  'GLB_TOO_LARGE',
  'GLB_TOO_COMPLEX',
  'GLB_IMPORT_FAILED',
  'GLB_EMPTY',
  'LABEL_NOT_FOUND',
  'INVALID_TIMELINE',
  'RENDER_FAILED',
  'SCRIPT_ERROR',
] as const;

/** Mỗi dòng stdout của worker là một JSON thuộc union này (JSON-lines). */
export const WorkerEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('log'),
    level: z.enum(['debug', 'info', 'warn']).default('info'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('device'),
    engine: RenderEngine,
    device: z.string(),
    backend: z.string().optional(),
    detail: z.string().optional(),
    fallbackToCpu: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('progress'),
    phase: z.enum(['import', 'scene', 'render']),
    frame: z.number().int().min(0),
    total: z.number().int().min(0),
  }),
  z.object({
    type: z.literal('frame_done'),
    frame: z.number().int().min(1),
    path: z.string(),
    ms: z.number(),
    skipped: z.boolean().default(false),
  }),
  z.object({
    type: z.literal('warning'),
    code: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    detail: z.string().optional(),
  }),
  z.object({
    type: z.literal('done'),
    frames: z.number().int().min(0),
    ms: z.number(),
  }),
]);
export type WorkerEvent = z.infer<typeof WorkerEvent>;
