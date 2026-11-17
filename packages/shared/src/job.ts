import { z } from 'zod';

export const JOB_STATUSES = [
  'queued',
  'preparing',
  'rendering',
  'encoding',
  'done',
  'failed',
  'canceled',
  'paused',
  'needs_attention',
] as const;
export const JobStatus = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof JobStatus>;

export const ACTIVE_JOB_STATUSES = ['preparing', 'rendering', 'encoding'] as const satisfies readonly JobStatus[];
/** Không chạy cho tới khi người dùng can thiệp (tiếp tục / thử lại) nên không chặn hàng đợi. */
export const HELD_JOB_STATUSES = ['paused', 'needs_attention'] as const satisfies readonly JobStatus[];
export const TERMINAL_JOB_STATUSES = ['done', 'failed', 'canceled'] as const satisfies readonly JobStatus[];

export const JobTarget = z.enum(['local', 'cloud']);
export type JobTarget = z.infer<typeof JobTarget>;

export const JobPriority = z.enum(['preview', 'final']);
export type JobPriority = z.infer<typeof JobPriority>;

export const RenderEngine = z.enum(['eevee', 'cycles']);
export type RenderEngine = z.infer<typeof RenderEngine>;

export const RenderDevice = z.enum(['auto', 'cpu', 'optix', 'cuda', 'hip', 'oneapi', 'metal']);
export type RenderDevice = z.infer<typeof RenderDevice>;

export const MotionKind = z.enum(['orbit', 'spin360']);
export type MotionKind = z.infer<typeof MotionKind>;

export const SizeMm = z.object({
  width: z.number().positive().max(5000),
  depth: z.number().positive().max(5000),
  height: z.number().positive().max(5000),
});
export type SizeMm = z.infer<typeof SizeMm>;

export const LabelSpec = z.object({
  imagePath: z.string().min(1),
  mode: z.enum(['cylinder', 'flat']).default('cylinder'),
  widthMm: z.number().positive().max(5000).optional(),
  heightMm: z.number().positive().max(5000).optional(),
  bottomMm: z.number().min(0).max(5000).optional(),
  centerDeg: z.number().min(-180).max(180).default(0),
});
export type LabelSpec = z.infer<typeof LabelSpec>;

export const ProductSpec = z.object({
  glbPath: z.string().min(1),
  sizeMm: SizeMm.optional(),
  label: LabelSpec.optional(),
});
export type ProductSpec = z.infer<typeof ProductSpec>;

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const SceneSpec = z.object({
  template: z.enum(['studio-soft']).default('studio-soft'),
  backgroundColor: HexColor.default('#e9e4dc'),
  shadow: z.number().min(0).max(1).default(0.7),
});
export type SceneSpec = z.infer<typeof SceneSpec>;

export const OutputSpec = z.object({
  kind: z.enum(['image', 'video']),
  width: z.number().int().min(64).max(4096).default(1280),
  height: z.number().int().min(64).max(4096).default(720),
  fps: z.number().int().min(1).max(60).default(30),
  durationS: z.number().min(0.5).max(60).default(5),
  motion: MotionKind.default('orbit'),
  stillAngleDeg: z.number().min(-360).max(360).default(0),
  engine: RenderEngine.default('eevee'),
  samples: z.number().int().min(1).max(4096).default(32),
  device: RenderDevice.default('auto'),
  logoPath: z.string().min(1).optional(),
});
export type OutputSpec = z.infer<typeof OutputSpec>;

export const RenderRequest = z.object({
  name: z.string().trim().min(1).max(120).default('Render'),
  target: JobTarget.default('local'),
  priority: JobPriority.default('final'),
  product: ProductSpec,
  scene: SceneSpec.prefault({}),
  output: OutputSpec,
});
export type RenderRequest = z.infer<typeof RenderRequest>;
export type RenderRequestInput = z.input<typeof RenderRequest>;

export function totalFramesFor(output: Pick<OutputSpec, 'kind' | 'fps' | 'durationS'>): number {
  return output.kind === 'image' ? 1 : Math.max(1, Math.round(output.fps * output.durationS));
}

export const JobRecord = z.object({
  id: z.string(),
  name: z.string(),
  target: JobTarget,
  priority: JobPriority,
  status: JobStatus,
  kind: z.enum(['image', 'video']),
  engine: RenderEngine,
  request: RenderRequest,
  frame: z.number().int().min(0),
  totalFrames: z.number().int().min(1),
  progress: z.number().min(0).max(1),
  estimateS: z.number().nullable(),
  costCredits: z.number().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  deviceInfo: z.string().nullable(),
  workDir: z.string().nullable(),
  outputPath: z.string().nullable(),
  attempts: z.number().int().min(0),
  /** Số lần lỗi liên tiếp (kể cả bị gián đoạn do crash); chạm ngưỡng thì chuyển `needs_attention`. */
  failures: z.number().int().min(0).default(0),
  createdAt: z.number(),
  updatedAt: z.number(),
  startedAt: z.number().nullable(),
  finishedAt: z.number().nullable(),
});
export type JobRecord = z.infer<typeof JobRecord>;
