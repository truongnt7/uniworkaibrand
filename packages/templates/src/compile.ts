import {
  AppError,
  SlideshowJob,
  slideshowDurationS,
  slideshowSceneStarts,
  slideshowSize,
  type SlideScene,
  type SlideText,
  type SlideshowJobInput,
} from '@aps/shared';
import { NBSP, stripEmoji, validateInput, type InputIssue, type InputWarning, type NormalizedInput, type TemplateUserInput } from './inputs.js';
import { FIELD_KEYS, type Aspect, type FieldKey, type Template, type TemplateScene, type TemplateText } from './schema.js';

export interface CompileOptions {
  jobId: string;
  /** Tệp TTF/OTF có tiếng Việt (ứng dụng cung cấp). */
  fontPath: string;
  aspect?: Aspect;
  quality?: 'final' | 'preview';
  fps?: number;
  /** Màu thương hiệu (#rrggbb) thay cho màu chủ đạo của mẫu. */
  brandColor?: string;
  logoPath?: string;
  musicPath?: string;
}

export interface CompiledTemplate {
  job: SlideshowJob;
  warnings: InputWarning[];
  /** Ảnh người dùng chọn nhưng mẫu không dùng tới (ví dụ vì ô ghép thiếu ảnh). */
  unusedPhotos: string[];
}

export class TemplateInputError extends AppError {
  constructor(readonly issues: InputIssue[]) {
    super('TEMPLATE_INPUT_INVALID', issues.map((i) => i.message).join(' '), { issues });
    this.name = 'TemplateInputError';
  }
}

const PLACEHOLDER = /\{\{\s*([A-Za-z]+(?::[a-z0-9-]+)?)\s*\}\}/g;

/**
 * Thay `{{...}}` bằng dữ liệu người dùng. Trả `null` nếu có trường trống (dòng đó bị bỏ). Không bao giờ tự bịa giá trị.
 */
export function fillPlaceholders(text: string, input: NormalizedInput, target: 'video' | 'caption'): string | null {
  let missing = false;
  const out = text.replace(PLACEHOLDER, (_m, key: string) => {
    let v: string | undefined;
    if (key.startsWith('caption:')) v = input.captions[key.slice('caption:'.length)];
    else if ((FIELD_KEYS as readonly string[]).includes(key)) v = input.values[key as FieldKey];
    if (!v) {
      missing = true;
      return '';
    }
    if (target === 'video') {
      const clean = stripEmoji(v);
      return key === 'phone' ? clean.replace(/ /g, NBSP) : clean;
    }
    return v;
  });
  if (missing) return null;
  const result = out.replace(/[ ]{2,}/g, ' ').trim();
  return result ? result : null;
}

const MOTION_CYCLE = ['zoom_in', 'pan_right', 'zoom_out', 'pan_left'] as const;

function resolveColor(c: TemplateText['color'] | undefined, primary: string, accent: string, fallback: string): string {
  if (c === 'primary') return primary;
  if (c === 'accent') return accent;
  return c ?? fallback;
}

export function compileTemplate(template: Template, user: TemplateUserInput, opts: CompileOptions): CompiledTemplate {
  const aspect = opts.aspect ?? template.defaultAspect;
  const checked = validateInput(template, user, { aspect });
  if (!checked.ok) throw new TemplateInputError(checked.issues);
  const { input, warnings } = checked;

  const primary = opts.brandColor ?? template.palette.primary;
  const accent = template.palette.accent;
  const { width, height } = slideshowSize(aspect, opts.quality ?? 'final');
  const used = new Set<string>();

  const buildTexts = (src: TemplateScene, isCard: boolean, duration: number): SlideText[] => {
    const texts: SlideText[] = [];
    for (const t of src.texts) {
      const filled = fillPlaceholders(t.text, input, 'video');
      if (filled === null) continue;
      const start = t.t ?? 0;
      if (start >= duration) continue;
      const tEnd = t.tEnd !== undefined ? Math.min(t.tEnd, duration) : undefined;
      texts.push({
        text: filled,
        position: t.position,
        style: t.style,
        color: resolveColor(t.color, primary, accent, '#ffffff'),
        box: t.box ?? !isCard,
        boxColor: '#000000',
        boxOpacity: t.boxOpacity ?? 0.45,
        anim: 'fade',
        t: start,
        ...(tEnd !== undefined && tEnd > start ? { tEnd } : {}),
      });
    }
    return texts;
  };

  const scenes: SlideScene[] = [];
  let photoIndex = 0;
  for (const src of template.scenes) {
    const base = {
      durationS: src.durationS,
      transition: scenes.length === 0 ? ('none' as const) : (src.transition ?? 'fade'),
    };
    const prev = scenes[scenes.length - 1];
    const wanted = src.transitionS ?? 0.5;
    const limit = prev ? Math.max(0.2, 0.45 * Math.min(prev.durationS, src.durationS)) : wanted;
    const transitionS = Math.min(wanted, Math.floor(limit * 100) / 100);

    if (src.type === 'photo') {
      const path = input.photos[src.slot];
      if (!path) continue;
      used.add(src.slot);
      scenes.push({
        type: 'photo',
        imagePath: path,
        fit: src.fit ?? 'cover',
        motion: src.motion ?? MOTION_CYCLE[photoIndex % MOTION_CYCLE.length]!,
        zoom: src.zoom ?? 0.12,
        shade: src.shade ?? 0,
        ...base,
        transitionS,
        texts: buildTexts(src, false, src.durationS),
      });
      photoIndex++;
    } else if (src.type === 'collage') {
      const present = src.slots.filter((id) => input.photos[id]);
      if (present.length < 2) continue;
      present.forEach((id) => used.add(id));
      scenes.push({
        type: 'collage',
        imagePaths: present.map((id) => input.photos[id]!),
        dividers: true,
        motion: src.motion ?? 'zoom_in',
        zoom: src.zoom ?? 0.06,
        shade: src.shade ?? 0,
        ...base,
        transitionS,
        texts: buildTexts(src, false, src.durationS),
      });
    } else {
      scenes.push({
        type: 'card',
        backgroundColor: resolveColor(src.background, primary, accent, primary),
        ...base,
        transitionS,
        texts: buildTexts(src, true, src.durationS),
      });
    }
  }
  if (scenes.length === 0) throw new TemplateInputError([{ field: 'photo', code: 'no_photo_scene', message: 'Chưa đủ ảnh để dựng video. Hãy thêm ảnh theo hướng dẫn của mẫu.' }]);

  const draft: SlideshowJobInput = {
    version: 1,
    kind: 'slideshow',
    jobId: opts.jobId,
    output: { width, height, fps: opts.fps ?? 30 },
    fontPath: opts.fontPath,
    scenes,
    ...(opts.musicPath && template.music === 'optional' ? { audio: { path: opts.musicPath } } : {}),
  };
  const total = slideshowDurationS({ scenes });
  if (opts.logoPath && template.logo !== 'none') {
    const starts = slideshowSceneStarts({ scenes });
    draft.logo =
      template.logo === 'end_card'
        ? { imagePath: opts.logoPath, position: 'top_center', heightPct: 0.1, t: Math.min(starts[starts.length - 1]!, total - 0.5), tEnd: total }
        : { imagePath: opts.logoPath, position: 'top_right', heightPct: 0.08, t: 0, tEnd: total };
  }

  const job = SlideshowJob.parse(draft);
  const unusedPhotos = Object.entries(input.photos).filter(([id]) => !used.has(id)).map(([, p]) => p);
  return { job, warnings, unusedPhotos };
}
