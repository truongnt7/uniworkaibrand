import { z } from 'zod';
import { Timeline, aspectToSize, type CameraFrom } from '@aps/ai';
import {
  AppError,
  Ease,
  HexColor,
  LightSegment,
  type LightSegmentInput,
  type RenderRequest,
  SCENE_TEMPLATES,
  TextOverlay,
  WorkerJobV2,
  type Keyframe,
  type LabelSpec,
  type LogoOverlay,
  type RenderDevice,
  type RenderEngine,
  type SceneTemplate,
  type SizeMm,
  totalFramesFor,
} from '@aps/shared';
import { FRAME_PATTERN } from './compile.js';

/**
 * Biên dịch timeline (JSON do Đạo diễn AI hoặc UI tạo) thành job.json v2 cho blender-worker.
 * Đây là bước tất định thuần dữ liệu: timeline -> keyframe số. Không có mã nào do LLM sinh được chạy trong Blender;
 * worker chỉ nhận các track số đã kiểm tra bằng schema (xem WorkerJobV2 trong @aps/shared).
 */

export const ELEVATION_DEG: Record<CameraFrom, number> = { eye_level: 11, high: 35, low: 2 };
export const DOLLY_SCALE_RANGE = { min: 0.35, max: 2.5 } as const;
/** Hai keyframe gần hơn mức này (giây) được coi là cùng một thời điểm. */
const EPS = 1e-3;

interface TemplateStyle {
  backgroundColor: string;
  shadow: number;
  keyScale: number;
  fillScale: number;
  rimScale: number;
  /** Đèn chính quét qua sản phẩm trong suốt video (độ, tổng biên độ); 0 = đứng yên. */
  keySweepDeg: number;
}

/** Mẫu cảnh -> thông số số học. Mẫu ngoài danh sách bị đổi về studio-soft kèm cảnh báo, không bao giờ làm hỏng job. */
export const TEMPLATE_STYLES: Record<SceneTemplate, TemplateStyle> = {
  'studio-soft': { backgroundColor: '#e9e4dc', shadow: 0.7, keyScale: 1, fillScale: 1, rimScale: 1, keySweepDeg: 0 },
  'nature-soft': { backgroundColor: '#dbe3cf', shadow: 0.6, keyScale: 1.05, fillScale: 1.1, rimScale: 0.8, keySweepDeg: 0 },
  'minimal-white': { backgroundColor: '#f5f5f2', shadow: 0.45, keyScale: 1.1, fillScale: 1.2, rimScale: 0.6, keySweepDeg: 0 },
  'luxury-dark': { backgroundColor: '#241f1a', shadow: 0.85, keyScale: 0.9, fillScale: 0.4, rimScale: 1.6, keySweepDeg: 30 },
};

export const PALETTE_COLORS = { warm: '#efe0cf', cool: '#dde6ee', neutral: '#e4e4e4', dark: '#17171a' } as const;

export interface TimelineCompileContext {
  jobId: string;
  framesDir: string;
  product: { glbPath: string; sizeMm?: SizeMm | undefined; label?: LabelSpec | undefined };
  /** Kích thước khung hình; mặc định suy ra từ `aspect` của timeline (cạnh ngắn = `shortSide`). */
  width?: number;
  height?: number;
  shortSide?: number;
  engine?: RenderEngine;
  samples?: number;
  device?: RenderDevice;
  logoPath?: string | undefined;
  /** Màu thương hiệu cho palette `brand` (mặc định theo mẫu cảnh). */
  brandColor?: string | undefined;
  /** Track do UI/người dùng thêm (không phải LLM): chữ và ánh sáng. */
  extras?: { text?: z.input<typeof TextOverlay>[]; lights?: LightSegmentInput[] };
  qcGrid?: boolean;
}

export interface TimelineCompileResult {
  job: WorkerJobV2;
  /** Phần timeline không thể thể hiện ở worker hiện tại hoặc đã bị điều chỉnh. */
  warnings: string[];
}

interface Seg {
  t0: number;
  t1: number;
  /** Giá trị đầu đoạn; bỏ trống = giá trị hiện tại. Khác giá trị hiện tại = cắt cảnh (hoặc chuyển mượt nếu có khoảng trống). */
  v0?: number;
  v1: number;
  ease: Ease;
  /** Cách nội suy từ cuối đoạn tới đoạn kế (qua khoảng trống). */
  after?: Ease;
}

/** Dựng chuỗi keyframe đơn điệu thời gian từ các đoạn không chồng nhau. */
export function buildTrack(initial: number, segs: readonly Seg[]): Keyframe[] {
  const kfs: Keyframe[] = [{ t: 0, v: initial, ease: 'linear' }];
  let cur = initial;
  const at = (t: number, v: number, ease: Ease) => {
    const last = kfs[kfs.length - 1]!;
    if (Math.abs(last.t - t) < EPS) {
      const prev = kfs[kfs.length - 2];
      if (prev && Math.abs(last.v - v) > 1e-9 && last.t - prev.t > 2 * EPS) {
        // Cắt cảnh: giữ giá trị cũ tới sát t rồi nhảy sang giá trị mới, thay vì trượt dần suốt đoạn trước.
        last.t = t - EPS;
        last.ease = 'linear';
        kfs.push({ t, v, ease });
      } else {
        last.v = v;
        last.ease = ease;
      }
    } else {
      kfs.push({ t, v, ease });
    }
  };
  for (const s of segs) {
    const v0 = s.v0 ?? cur;
    at(s.t0, v0, s.ease);
    at(s.t1, s.v1, s.after ?? 'linear');
    cur = s.v1;
  }
  return kfs.map((k) => ({ ...k, t: round(k.t), v: round(k.v) }));
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function describeIssues(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`)
    .join('; ');
}

export function isSceneTemplate(id: string): id is SceneTemplate {
  return (SCENE_TEMPLATES as readonly string[]).includes(id);
}

/** Kiểm tra timeline bằng schema đầy đủ của Đạo diễn AI (strict: khoá lạ như "script"/"bpy" bị từ chối). */
export function parseTimeline(raw: unknown): Timeline {
  const parsed = Timeline.safeParse(raw);
  if (!parsed.success) throw new AppError('INVALID_TIMELINE', `timeline không hợp lệ: ${describeIssues(parsed.error)}`);
  return parsed.data;
}

export function compileTimelineJob(raw: unknown, ctx: TimelineCompileContext): TimelineCompileResult {
  const tl = parseTimeline(raw);
  const warnings: string[] = [];

  const auto = aspectToSize(tl.aspect, ctx.shortSide ?? 720);
  const width = ctx.width ?? auto.width;
  const height = ctx.height ?? auto.height;
  if (ctx.width !== undefined || ctx.height !== undefined) {
    if (Math.abs(width / height - auto.width / auto.height) > 0.01) {
      warnings.push(`aspect_mismatch: timeline yêu cầu ${tl.aspect} nhưng khung hình là ${width}x${height}`);
    }
  }
  const total = Math.max(1, Math.round(tl.fps * tl.duration_s));

  // Cảnh: mẫu + palette -> màu nền, độ đổ bóng, hệ số đèn.
  let template: SceneTemplate = 'studio-soft';
  if (isSceneTemplate(tl.scene.template_id)) template = tl.scene.template_id;
  else warnings.push(`scene_template_unsupported: "${tl.scene.template_id}" chưa có trong worker, dùng studio-soft`);
  const style = TEMPLATE_STYLES[template];
  let backgroundColor: string = style.backgroundColor;
  if (tl.scene.palette === 'brand') {
    if (ctx.brandColor && HexColor.safeParse(ctx.brandColor).success) backgroundColor = ctx.brandColor.toLowerCase();
  } else {
    backgroundColor = PALETTE_COLORS[tl.scene.palette];
  }
  const hide = tl.scene.hide.filter((h) => h === 'platform');
  const unsupportedHide = tl.scene.hide.filter((h) => h !== 'platform');
  if (unsupportedHide.length) warnings.push(`scene_hide_unsupported: worker chưa có ${unsupportedHide.join(', ')}`);

  // Sản phẩm: spin360 cộng 360 độ mỗi vòng, still giữ góc. `speed` đã được Đạo diễn quy đổi thành `turns`/thời lượng.
  let rot = 0;
  const productSegs: Seg[] = tl.tracks.product.map((s) => {
    const v0 = rot;
    rot += s.motion === 'spin360' ? 360 * s.turns : 0;
    return { t0: s.t, t1: s.t_end, v0, v1: rot, ease: s.ease };
  });

  // Camera: góc nâng theo `from` (chuyển mượt qua khoảng trống giữa các đoạn), quỹ đạo cộng dồn, dolly nhân khoảng cách.
  const cam = tl.tracks.camera;
  const firstEl = ELEVATION_DEG[cam[0]?.from ?? 'eye_level'];
  let az = 0;
  let dist = 1;
  const azSegs: Seg[] = [];
  const elSegs: Seg[] = [];
  const distSegs: Seg[] = [];
  for (const s of cam) {
    const el = ELEVATION_DEG[s.from];
    elSegs.push({ t0: s.t, t1: s.t_end, v0: el, v1: el, ease: 'smooth', after: 'smooth' });
    const az0 = az;
    if (s.move === 'orbit') az += s.degrees;
    azSegs.push({ t0: s.t, t1: s.t_end, v0: az0, v1: az, ease: s.ease });
    const d0 = dist;
    if (s.move === 'dolly_in') dist = clamp(dist * (1 - s.amount), DOLLY_SCALE_RANGE.min, DOLLY_SCALE_RANGE.max);
    else if (s.move === 'dolly_out') dist = clamp(dist * (1 + s.amount), DOLLY_SCALE_RANGE.min, DOLLY_SCALE_RANGE.max);
    distSegs.push({ t0: s.t, t1: s.t_end, v0: d0, v1: dist, ease: s.ease });
  }

  // Ánh sáng: nền theo mẫu cảnh, cộng thêm đoạn từ UI (nếu có).
  const lightSegs = (ctx.extras?.lights ?? []).map((l) => LightSegment.parse(l));
  for (const [i, l] of lightSegs.entries()) {
    if (l.t_end <= l.t || l.t_end > tl.duration_s + 1e-6) {
      throw new AppError('INVALID_TIMELINE', `lights[${i}]: khoảng thời gian không hợp lệ`);
    }
  }
  const lightTrack = (initial: number, pick: (l: LightSegment) => number | undefined): Keyframe[] => {
    const segs: Seg[] = [];
    let prevEnd = -1;
    for (const l of [...lightSegs].sort((a, b) => a.t - b.t)) {
      const target = pick(l);
      if (target === undefined) continue;
      if (l.t < prevEnd - EPS) throw new AppError('INVALID_TIMELINE', 'các đoạn ánh sáng cùng kênh không được chồng nhau');
      prevEnd = l.t_end;
      segs.push({ t0: l.t, t1: l.t_end, v1: target, ease: l.ease });
    }
    return buildTrack(initial, segs);
  };
  const keyAz =
    style.keySweepDeg > 0 && !lightSegs.some((l) => l.key_azimuth_deg !== undefined)
      ? buildTrack(-style.keySweepDeg / 2, [{ t0: 0, t1: tl.duration_s, v1: style.keySweepDeg / 2, ease: 'smooth' }])
      : lightTrack(0, (l) => l.key_azimuth_deg);

  // Overlay: logo (ffmpeg) từ timeline, chữ (Blender) từ UI.
  const logos: LogoOverlay[] = [];
  if (tl.tracks.logo.length) {
    if (ctx.logoPath) {
      for (const l of tl.tracks.logo) {
        logos.push({ t: l.t, tEnd: l.t_end, imagePath: ctx.logoPath, position: l.position, anim: l.anim });
      }
    } else {
      warnings.push('logo_missing: timeline có logo nhưng sản phẩm chưa có ảnh logo, bỏ qua');
    }
  }
  const texts = (ctx.extras?.text ?? []).map((t) => TextOverlay.parse(t));
  for (const [i, t] of texts.entries()) {
    if (t.tEnd <= t.t || t.tEnd > tl.duration_s + 1e-6) {
      throw new AppError('INVALID_TIMELINE', `text[${i}]: khoảng thời gian không hợp lệ`);
    }
  }
  if (tl.lock_label && !ctx.product.label) warnings.push('label_not_provided: lock_label bật nhưng sản phẩm không có ảnh nhãn');

  const candidate = {
    version: 2,
    mode: 'render',
    jobId: ctx.jobId,
    ...(ctx.qcGrid ? { qcGrid: true } : {}),
    product: {
      glbPath: ctx.product.glbPath,
      ...(ctx.product.sizeMm ? { sizeMm: ctx.product.sizeMm } : {}),
      ...(ctx.product.label ? { label: ctx.product.label } : {}),
      lockLabel: tl.lock_label,
    },
    scene: { template, backgroundColor, shadow: style.shadow, hide },
    render: {
      engine: ctx.engine ?? 'eevee',
      samples: ctx.samples ?? 32,
      width,
      height,
      device: ctx.device ?? 'auto',
    },
    frames: { total, fps: tl.fps },
    tracks: {
      product: { rotZDeg: buildTrack(0, productSegs) },
      camera: {
        azimuthDeg: buildTrack(0, azSegs),
        elevationDeg: buildTrack(firstEl, elSegs),
        distanceScale: buildTrack(1, distSegs),
      },
      light: {
        keyScale: lightTrack(style.keyScale, (l) => l.key_scale),
        fillScale: lightTrack(style.fillScale, (l) => l.fill_scale),
        rimScale: lightTrack(style.rimScale, (l) => l.rim_scale),
        keyAzimuthDeg: keyAz,
      },
    },
    overlays: { logo: logos, text: texts },
    paths: { framesDir: ctx.framesDir, pattern: FRAME_PATTERN },
  };
  const parsed = WorkerJobV2.safeParse(candidate);
  if (!parsed.success) throw new AppError('INVALID_TIMELINE', `không biên dịch được timeline: ${describeIssues(parsed.error)}`);
  return { job: parsed.data, warnings };
}

/**
 * Ngữ cảnh biên dịch từ một RenderRequest đã lưu: kích thước/engine/logo lấy từ `output`, nên khung hình ghi ra
 * và encode ffmpeg luôn dùng cùng một kích thước.
 */
export function timelineContextFromRequest(request: RenderRequest, opts: { jobId: string; framesDir: string }): TimelineCompileContext {
  const { output, product } = request;
  return {
    jobId: opts.jobId,
    framesDir: opts.framesDir,
    product: { glbPath: product.glbPath, sizeMm: product.sizeMm, label: product.label },
    width: output.width,
    height: output.height,
    engine: output.engine,
    samples: output.samples,
    device: output.device,
    logoPath: output.logoPath,
    brandColor: request.extras?.brandColor,
    extras: { text: request.extras?.text, lights: request.extras?.lights },
  };
}

/** Biên dịch thử (không ghi gì) để từ chối sớm timeline sai và lấy cảnh báo; đồng thời kiểm số khung khớp `output`. */
export function checkTimelineRequest(request: RenderRequest): TimelineCompileResult {
  if (!request.timeline) throw new AppError('INVALID_TIMELINE', 'yêu cầu không có timeline');
  if (request.output.kind !== 'video') throw new AppError('INVALID_TIMELINE', 'timeline chỉ dùng cho video');
  const result = compileTimelineJob(request.timeline, timelineContextFromRequest(request, { jobId: 'check', framesDir: '/check' }));
  const expected = totalFramesFor(request.output);
  if (result.job.frames.total !== expected || result.job.frames.fps !== request.output.fps) {
    throw new AppError(
      'INVALID_TIMELINE',
      `output (${request.output.fps} fps, ${request.output.durationS} s) không khớp timeline (${result.job.frames.fps} fps, ${result.job.frames.total} khung)`,
    );
  }
  return result;
}
