import { z } from 'zod';

export const HexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const EASES = ['linear', 'smooth', 'ease_in', 'ease_out'] as const;
export const Ease = z.enum(EASES);
export type Ease = z.infer<typeof Ease>;

export const LOGO_POSITIONS = ['center', 'bottom_center', 'bottom_right', 'bottom_left', 'top_right', 'top_left'] as const;
export const OVERLAY_ANIMS = ['fade_in', 'slide_up', 'none'] as const;
export const TEXT_POSITIONS = ['top_center', 'center', 'bottom_center'] as const;

const OverlayTime = z.number().min(0).max(3600);

/** Logo overlay do ffmpeg thực hiện (pixel logo gốc, ngoài shading 3D nên không méo). */
export const LogoOverlay = z.strictObject({
  t: OverlayTime,
  tEnd: OverlayTime,
  imagePath: z.string().min(1),
  position: z.enum(LOGO_POSITIONS).default('center'),
  anim: z.enum(OVERLAY_ANIMS).default('fade_in'),
});
export type LogoOverlay = z.infer<typeof LogoOverlay>;

/** Chữ do blender-worker dựng (font đi kèm Blender, hỗ trợ tiếng Việt), người dùng nhập, không do LLM sinh. */
export const TextOverlay = z.strictObject({
  t: OverlayTime,
  tEnd: OverlayTime,
  text: z.string().trim().min(1).max(80),
  position: z.enum(TEXT_POSITIONS).default('bottom_center'),
  anim: z.enum(OVERLAY_ANIMS).default('fade_in'),
  color: HexColor.default('#ffffff'),
  /** Chiều cao chữ theo % chiều cao khung hình. */
  sizePct: z.number().min(2).max(20).default(6),
});
export type TextOverlay = z.infer<typeof TextOverlay>;
