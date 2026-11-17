import { z } from 'zod';
import { HexColor, LabelSpec, RenderDevice, RenderEngine, MotionKind, SizeMm } from './job.js';

/** Đầu vào của blender-worker: file job.json do orchestrator ghi. */
export const WorkerJob = z.object({
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
export type WorkerJob = z.infer<typeof WorkerJob>;
export type WorkerJobInput = z.input<typeof WorkerJob>;

export const WORKER_ERROR_CODES = [
  'INVALID_JOB',
  'GLB_NOT_FOUND',
  'GLB_TOO_LARGE',
  'GLB_TOO_COMPLEX',
  'GLB_IMPORT_FAILED',
  'GLB_EMPTY',
  'LABEL_NOT_FOUND',
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
