import { z } from 'zod';

/**
 * Timeline JSON: nguồn sự thật cho Studio video (UI và Đạo diễn AI cùng ghi).
 * AI chỉ xuất dữ liệu theo schema này, KHÔNG BAO GIỜ xuất mã bpy/Python.
 * Mọi object là strict: khoá lạ (ví dụ "script", "bpy") làm đầu ra bị từ chối.
 */
export const TIMELINE_VERSION = 1 as const;

export const ASPECTS = ['16:9', '9:16', '1:1', '4:5'] as const;
export const Aspect = z.enum(ASPECTS);
export type Aspect = z.infer<typeof Aspect>;

export const Speed = z.enum(['slow', 'normal', 'fast']);
export type Speed = z.infer<typeof Speed>;

export const Ease = z.enum(['linear', 'smooth', 'ease_in', 'ease_out']);
export type Ease = z.infer<typeof Ease>;

export const CameraFrom = z.enum(['eye_level', 'high', 'low']);
export type CameraFrom = z.infer<typeof CameraFrom>;

export const SCENE_HIDE = ['platform', 'leaves', 'props'] as const;
export const SceneHide = z.enum(SCENE_HIDE);

export const LIMITS = {
  durationS: { min: 2, max: 60 },
  fps: { min: 15, max: 60 },
  turns: { min: 0.25, max: 4 },
  orbitDegrees: { min: -360, max: 360 },
  dollyAmount: { min: 0.05, max: 0.6 },
} as const;

const time = z.number().min(0).max(LIMITS.durationS.max);

const segmentBase = {
  t: time,
  t_end: time,
};

export const ProductSegment = z.strictObject({
  ...segmentBase,
  motion: z.enum(['spin360', 'still']),
  /** Số vòng quay trong đoạn (1 = đúng 360°). Bỏ qua khi motion = still. */
  turns: z.number().min(LIMITS.turns.min).max(LIMITS.turns.max).default(1),
  speed: Speed.default('normal'),
  ease: Ease.default('smooth'),
});
export type ProductSegment = z.infer<typeof ProductSegment>;

export const CameraSegment = z.strictObject({
  ...segmentBase,
  move: z.enum(['static', 'dolly_in', 'dolly_out', 'orbit']),
  from: CameraFrom.default('eye_level'),
  /** Chỉ dùng cho orbit. */
  degrees: z.number().min(LIMITS.orbitDegrees.min).max(LIMITS.orbitDegrees.max).default(90),
  /** Chỉ dùng cho dolly: tỉ lệ khoảng cách đã tiến/lùi (0,05–0,6). */
  amount: z.number().min(LIMITS.dollyAmount.min).max(LIMITS.dollyAmount.max).default(0.3),
  ease: Ease.default('smooth'),
});
export type CameraSegment = z.infer<typeof CameraSegment>;

export const LOGO_POSITIONS = ['center', 'bottom_center', 'bottom_right', 'bottom_left', 'top_right', 'top_left'] as const;
export const LogoSegment = z.strictObject({
  ...segmentBase,
  anim: z.enum(['fade_in', 'slide_up', 'none']).default('fade_in'),
  position: z.enum(LOGO_POSITIONS).default('center'),
});
export type LogoSegment = z.infer<typeof LogoSegment>;

export const SceneParams = z.strictObject({
  template_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,39}$/, 'template_id chỉ gồm chữ thường, số, dấu gạch ngang')
    .default('studio-soft'),
  hide: z.array(SceneHide).max(SCENE_HIDE.length).default([]),
  palette: z.enum(['brand', 'warm', 'cool', 'neutral', 'dark']).default('brand'),
});
export type SceneParams = z.infer<typeof SceneParams>;

function checkTrack(
  name: string,
  segments: { t: number; t_end: number }[],
  duration: number,
  ctx: z.RefinementCtx,
): void {
  let prevEnd = 0;
  segments.forEach((s, i) => {
    const at = (msg: string) => ctx.addIssue({ code: 'custom', message: `${name}[${i}]: ${msg}`, path: ['tracks', name, i] });
    if (s.t_end <= s.t) at('t_end phải lớn hơn t');
    if (s.t_end > duration + 1e-6) at(`t_end (${s.t_end}) vượt duration_s (${duration})`);
    if (s.t < prevEnd - 1e-6) at('các đoạn phải theo thứ tự thời gian và không chồng nhau');
    prevEnd = Math.max(prevEnd, s.t_end);
  });
}

export const Timeline = z
  .strictObject({
    version: z.literal(TIMELINE_VERSION),
    aspect: Aspect,
    duration_s: z.number().min(LIMITS.durationS.min).max(LIMITS.durationS.max),
    fps: z.number().int().min(LIMITS.fps.min).max(LIMITS.fps.max),
    tracks: z.strictObject({
      product: z.array(ProductSegment).max(8).default([]),
      camera: z.array(CameraSegment).max(8).default([]),
      logo: z.array(LogoSegment).max(2).default([]),
    }),
    scene: SceneParams.prefault({}),
    /** Giữ nguyên nhãn: AI không được phép tắt (xem docs/ai-layer.md, chính sách giữ nhãn). */
    lock_label: z.boolean().default(true),
  })
  .superRefine((tl, ctx) => {
    checkTrack('product', tl.tracks.product, tl.duration_s, ctx);
    checkTrack('camera', tl.tracks.camera, tl.duration_s, ctx);
    checkTrack('logo', tl.tracks.logo, tl.duration_s, ctx);
  });

export type Timeline = z.infer<typeof Timeline>;
export type TimelineInput = z.input<typeof Timeline>;

export function timelineJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(Timeline, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
}
