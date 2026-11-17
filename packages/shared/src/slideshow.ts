import { z } from 'zod';
import { HexColor, LOGO_POSITIONS } from './overlay.js';

export const SLIDE_LOGO_POSITIONS = [...LOGO_POSITIONS, 'top_center'] as const;

/**
 * Job "ảnh sang video" (slideshow): pipeline thứ hai, chỉ dùng ffmpeg (không Blender, không dựng 3D).
 * Không phải một `version` của WorkerJob (đó là hợp đồng riêng với blender-worker); xem docs/industry-templates.md mục 3.
 * Mọi object là strict: khoá lạ bị từ chối. Chuỗi tự do duy nhất là văn bản hiển thị và đường dẫn tệp do người dùng chọn;
 * không có trường nào được nối vào dòng lệnh/filtergraph mà không qua escape (xem render-core/src/slideshow.ts).
 */
export const SLIDESHOW_VERSION = 1 as const;

export const SLIDESHOW_ASPECTS = ['9:16', '1:1', '4:5', '16:9'] as const;
export const SlideshowAspect = z.enum(SLIDESHOW_ASPECTS);
export type SlideshowAspect = z.infer<typeof SlideshowAspect>;

export const SLIDESHOW_LIMITS = {
  scenes: { max: 16 },
  sceneDurationS: { min: 1, max: 20 },
  totalDurationS: { max: 90 },
  texts: { max: 4 },
  textChars: { max: 200 },
  collageImages: { min: 2, max: 4 },
} as const;

export const SLIDE_MOTIONS = ['zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'none'] as const;
export const SlideMotion = z.enum(SLIDE_MOTIONS);
export type SlideMotion = z.infer<typeof SlideMotion>;

/** Chuyển cảnh vào cảnh này (bỏ qua ở cảnh đầu). `none` = cắt thẳng. Tên khớp bộ lọc xfade của ffmpeg. */
export const SLIDE_TRANSITIONS = ['none', 'fade', 'wipeleft', 'slideleft', 'zoomin'] as const;
export const SlideTransition = z.enum(SLIDE_TRANSITIONS);
export type SlideTransition = z.infer<typeof SlideTransition>;

export const SLIDE_TEXT_POSITIONS = ['top', 'center', 'lower_third', 'bottom'] as const;
export const SLIDE_TEXT_STYLES = ['title', 'body', 'small'] as const;

export const SlideText = z.strictObject({
  text: z.string().min(1).max(SLIDESHOW_LIMITS.textChars.max),
  position: z.enum(SLIDE_TEXT_POSITIONS).default('bottom'),
  /** title ~ 8% cạnh ngắn, body ~ 5,2%, small ~ 4%. Chữ tự xuống dòng và tự co nếu quá dài. */
  style: z.enum(SLIDE_TEXT_STYLES).default('body'),
  color: HexColor.default('#ffffff'),
  /** Nền mờ sau chữ để đọc được trên mọi ảnh. */
  box: z.boolean().default(true),
  boxColor: HexColor.default('#000000'),
  boxOpacity: z.number().min(0).max(1).default(0.45),
  anim: z.enum(['fade', 'none']).default('fade'),
  /** Giây tính từ đầu cảnh. */
  t: z.number().min(0).max(SLIDESHOW_LIMITS.sceneDurationS.max).default(0),
  /** Mặc định tới hết cảnh. */
  tEnd: z.number().min(0).max(SLIDESHOW_LIMITS.sceneDurationS.max).optional(),
});
export type SlideText = z.infer<typeof SlideText>;
export type SlideTextInput = z.input<typeof SlideText>;

const sceneBase = {
  durationS: z.number().min(SLIDESHOW_LIMITS.sceneDurationS.min).max(SLIDESHOW_LIMITS.sceneDurationS.max),
  transition: SlideTransition.default('fade'),
  transitionS: z.number().min(0.2).max(1.5).default(0.5),
  texts: z.array(SlideText).max(SLIDESHOW_LIMITS.texts.max).default([]),
};

const motionBase = {
  motion: SlideMotion.default('zoom_in'),
  /** Mức phóng tối đa (0,12 = 12%). Ken Burns nhẹ để không làm mờ ảnh điện thoại. */
  zoom: z.number().min(0).max(0.3).default(0.12),
  /** Phủ tối (0–0,8) để chữ đọc được trên ảnh sáng. */
  shade: z.number().min(0).max(0.8).default(0),
};

export const PhotoScene = z.strictObject({
  type: z.literal('photo'),
  imagePath: z.string().min(1),
  /** cover = cắt vừa khung; contain_blur = giữ nguyên cả ảnh, nền là chính ảnh đó làm mờ (hợp ảnh lệch tỉ lệ). */
  fit: z.enum(['cover', 'contain_blur']).default('cover'),
  ...motionBase,
  ...sceneBase,
});
export type PhotoScene = z.infer<typeof PhotoScene>;

/** Ghép 2–4 ảnh trong một khung (trước/sau, bộ sưu tập). 2 ảnh: chia theo chiều dài của khung. */
export const CollageScene = z.strictObject({
  type: z.literal('collage'),
  imagePaths: z.array(z.string().min(1)).min(SLIDESHOW_LIMITS.collageImages.min).max(SLIDESHOW_LIMITS.collageImages.max),
  dividers: z.boolean().default(true),
  ...motionBase,
  ...sceneBase,
});
export type CollageScene = z.infer<typeof CollageScene>;

/** Thẻ màu trơn (mở đầu/kết: tên, SĐT, địa chỉ). */
export const CardScene = z.strictObject({
  type: z.literal('card'),
  backgroundColor: HexColor.default('#111111'),
  ...sceneBase,
});
export type CardScene = z.infer<typeof CardScene>;

export const SlideScene = z.discriminatedUnion('type', [PhotoScene, CollageScene, CardScene]);
export type SlideScene = z.infer<typeof SlideScene>;

export const SlideLogo = z.strictObject({
  imagePath: z.string().min(1),
  position: z.enum(SLIDE_LOGO_POSITIONS).default('top_right'),
  /** Chiều cao logo theo % chiều cao khung. */
  heightPct: z.number().min(0.04).max(0.3).default(0.1),
  t: z.number().min(0).max(SLIDESHOW_LIMITS.totalDurationS.max).default(0),
  tEnd: z.number().min(0).max(SLIDESHOW_LIMITS.totalDurationS.max).optional(),
  anim: z.enum(['fade_in', 'none']).default('fade_in'),
});
export type SlideLogo = z.infer<typeof SlideLogo>;

/** Nhạc nền do người dùng chọn tệp; không có trường này = video không âm thanh. */
export const SlideAudio = z.strictObject({
  path: z.string().min(1),
  volume: z.number().min(0).max(1).default(0.7),
  fadeInS: z.number().min(0).max(5).default(1),
  fadeOutS: z.number().min(0).max(5).default(1.5),
});
export type SlideAudio = z.infer<typeof SlideAudio>;

const even = (n: number) => n % 2 === 0;

export const SlideshowJob = z
  .strictObject({
    version: z.literal(SLIDESHOW_VERSION),
    kind: z.literal('slideshow'),
    jobId: z.string().min(1).max(120),
    output: z.strictObject({
      width: z.number().int().min(240).max(2160).refine(even, 'width phải là số chẵn'),
      height: z.number().int().min(240).max(3840).refine(even, 'height phải là số chẵn'),
      fps: z.number().int().min(15).max(60).default(30),
      /** Trần dung lượng (byte) để chọn bitrate; mặc định 45 MB < giới hạn 50 MB của Zalo OA. */
      maxBytes: z.number().int().min(1_000_000).max(500_000_000).default(45_000_000),
    }),
    /** Tệp TTF/OTF có tiếng Việt (ví dụ Inter đi kèm app). Bắt buộc: không dựa vào font hệ thống. */
    fontPath: z.string().min(1),
    scenes: z.array(SlideScene).min(1).max(SLIDESHOW_LIMITS.scenes.max),
    logo: SlideLogo.optional(),
    audio: SlideAudio.optional(),
  })
  .superRefine((job, ctx) => {
    job.scenes.forEach((s, i) => {
      s.texts.forEach((t, k) => {
        if (t.tEnd !== undefined && t.tEnd <= t.t) {
          ctx.addIssue({ code: 'custom', message: `scenes[${i}].texts[${k}]: tEnd phải lớn hơn t`, path: ['scenes', i, 'texts', k] });
        }
        if (t.t >= s.durationS) {
          ctx.addIssue({ code: 'custom', message: `scenes[${i}].texts[${k}]: t vượt thời lượng cảnh`, path: ['scenes', i, 'texts', k] });
        }
      });
      s.texts.forEach((a, ka) => {
        s.texts.forEach((b, kb) => {
          if (kb <= ka || a.position !== b.position) return;
          const aEnd = a.tEnd ?? s.durationS;
          const bEnd = b.tEnd ?? s.durationS;
          if (a.t < bEnd && b.t < aEnd) {
            ctx.addIssue({ code: 'custom', message: `scenes[${i}].texts[${kb}]: trùng vị trí "${b.position}" với texts[${ka}] cùng lúc`, path: ['scenes', i, 'texts', kb] });
          }
        });
      });
      const prev = job.scenes[i - 1];
      if (prev && s.transition !== 'none') {
        const limit = 0.45 * Math.min(prev.durationS, s.durationS);
        if (s.transitionS > limit + 1e-6) {
          ctx.addIssue({
            code: 'custom',
            message: `scenes[${i}]: transitionS (${s.transitionS}) vượt 45% thời lượng cảnh ngắn hơn (${limit.toFixed(2)})`,
            path: ['scenes', i, 'transitionS'],
          });
        }
      }
    });
    if (slideshowDurationS(job) > SLIDESHOW_LIMITS.totalDurationS.max + 1e-6) {
      ctx.addIssue({ code: 'custom', message: `tổng thời lượng vượt ${SLIDESHOW_LIMITS.totalDurationS.max} giây`, path: ['scenes'] });
    }
  });
export type SlideshowJob = z.infer<typeof SlideshowJob>;
export type SlideshowJobInput = z.input<typeof SlideshowJob>;

type DurationShape = { scenes: readonly Pick<SlideScene, 'durationS' | 'transition' | 'transitionS'>[] };

/** Cảnh i>0 có chuyển cảnh (không phải `none`) chồng lên cảnh trước `transitionS` giây. */
export function slideshowDurationS(job: DurationShape): number {
  return job.scenes.reduce((sum, s, i) => sum + s.durationS - (i > 0 && s.transition !== 'none' ? s.transitionS : 0), 0);
}

/** Kích thước chuẩn theo tỉ lệ. `preview` = nửa độ phân giải (xem trước nhanh). */
export function slideshowSize(aspect: SlideshowAspect, quality: 'final' | 'preview' = 'final'): { width: number; height: number } {
  const base: readonly [number, number] = { '9:16': [1080, 1920], '1:1': [1080, 1080], '4:5': [1080, 1350], '16:9': [1920, 1080] }[aspect] as [number, number];
  const k = quality === 'preview' ? 0.5 : 1;
  const evenRound = (n: number) => Math.round((n * k) / 2) * 2;
  return { width: evenRound(base[0]), height: evenRound(base[1]) };
}

/** Thời điểm (giây) mỗi cảnh bắt đầu hiện trên video tổng, tính cả phần chồng của chuyển cảnh. */
export function slideshowSceneStarts(job: DurationShape): number[] {
  const starts: number[] = [];
  let t = 0;
  job.scenes.forEach((s, i) => {
    if (i > 0 && s.transition !== 'none') t -= s.transitionS;
    starts.push(Math.max(0, t));
    t += s.durationS;
  });
  return starts;
}
