import type { AspectRatio, Clip, Easing, ImageScene, MotionPreset, SceneComponentId, SpeedPreset, TimelineDoc, TrackId } from './types';

export const MIN_CLIP_S = 0.5;
export const MIN_DURATION_S = 3;
export const MAX_DURATION_S = 60;
export const DURATION_OPTIONS = [5, 10, 15, 30] as const;
export const EASINGS: readonly Easing[] = ['smooth', 'linear', 'easeIn', 'easeOut'];
export const VIDEO_ASPECTS: readonly AspectRatio[] = ['16:9', '9:16', '1:1'];
export const IMAGE_ASPECTS: readonly AspectRatio[] = ['1:1', '4:5', '16:9'];
export const TRACKS: readonly TrackId[] = ['product', 'camera', 'logo'];

const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function clipsFor(motion: MotionPreset, durationS: number): Clip[] {
  const d = durationS;
  const logo: Clip = { id: 'logo-1', track: 'logo', kind: 'fade_in', start: round1(d * 0.75), end: d, ease: 'smooth' };
  switch (motion) {
    case 'orbit':
      return [
        { id: 'product-1', track: 'product', kind: 'hold', start: 0, end: d, ease: 'linear' },
        { id: 'camera-1', track: 'camera', kind: 'orbit', start: 0, end: d, ease: 'smooth' },
        logo,
      ];
    case 'dollyIn':
      return [
        { id: 'product-1', track: 'product', kind: 'hold', start: 0, end: d, ease: 'linear' },
        { id: 'camera-1', track: 'camera', kind: 'dolly_in', start: 0, end: d, ease: 'smooth' },
        logo,
      ];
    case 'lift':
      return [
        { id: 'product-1', track: 'product', kind: 'lift', start: 0, end: d, ease: 'smooth' },
        { id: 'camera-1', track: 'camera', kind: 'dolly_in', start: 0, end: round1(d * 0.4), ease: 'smooth' },
        logo,
      ];
    case 'spin360':
    default: {
      const split = round1(d * 0.4);
      return [
        { id: 'product-1', track: 'product', kind: 'spin360', start: 0, end: d, ease: 'smooth' },
        { id: 'camera-1', track: 'camera', kind: 'dolly_in', start: 0, end: split, ease: 'smooth' },
        { id: 'camera-2', track: 'camera', kind: 'orbit', start: split, end: d, ease: 'smooth' },
        logo,
      ];
    }
  }
}

export function defaultTimeline(overrides: Partial<Pick<TimelineDoc, 'durationS' | 'motion' | 'aspect' | 'speed'>> = {}): TimelineDoc {
  const durationS = overrides.durationS ?? 15;
  const motion = overrides.motion ?? 'spin360';
  return {
    version: 1,
    aspect: overrides.aspect ?? '16:9',
    durationS,
    fps: 30,
    motion,
    speed: overrides.speed ?? 'slow',
    clips: clipsFor(motion, durationS),
    hidden: [],
    lockLabel: true,
  };
}

export function applyMotion(doc: TimelineDoc, motion: MotionPreset): TimelineDoc {
  return { ...doc, motion, clips: clipsFor(motion, doc.durationS) };
}

/** Đổi tổng thời lượng: co giãn tỉ lệ mọi clip. */
export function setDuration(doc: TimelineDoc, durationS: number): TimelineDoc {
  const next = clamp(durationS, MIN_DURATION_S, MAX_DURATION_S);
  const k = next / doc.durationS;
  return {
    ...doc,
    durationS: next,
    clips: doc.clips.map((c) => {
      const start = round1(c.start * k);
      const end = Math.min(next, Math.max(round1(c.end * k), start + MIN_CLIP_S));
      return { ...c, start, end };
    }),
  };
}

/** Sửa clip (thời lượng/easing); luôn kẹp trong biên và không chồng lấn clip cùng track. */
export function updateClip(doc: TimelineDoc, id: string, patch: Partial<Pick<Clip, 'start' | 'end' | 'ease'>>): TimelineDoc {
  const target = doc.clips.find((c) => c.id === id);
  if (!target) return doc;
  const siblings = doc.clips.filter((c) => c.track === target.track && c.id !== id);
  const prevEnd = Math.max(0, ...siblings.filter((c) => c.end <= target.start).map((c) => c.end));
  const nextStart = Math.min(doc.durationS, ...siblings.filter((c) => c.start >= target.end).map((c) => c.start));
  let start = clamp(round1(patch.start ?? target.start), prevEnd, doc.durationS - MIN_CLIP_S);
  let end = clamp(round1(patch.end ?? target.end), start + MIN_CLIP_S, nextStart);
  if (end - start < MIN_CLIP_S) start = Math.max(prevEnd, end - MIN_CLIP_S);
  end = Math.max(end, start + MIN_CLIP_S);
  const ease = patch.ease && EASINGS.includes(patch.ease) ? patch.ease : target.ease;
  return { ...doc, clips: doc.clips.map((c) => (c.id === id ? { ...c, start, end, ease } : c)) };
}

export function toggleHidden(hidden: SceneComponentId[], id: SceneComponentId): SceneComponentId[] {
  return hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
}

export function validateTimeline(doc: TimelineDoc): string[] {
  const errors: string[] = [];
  if (doc.durationS < MIN_DURATION_S || doc.durationS > MAX_DURATION_S) errors.push('duration');
  for (const c of doc.clips) {
    if (c.start < 0 || c.end > doc.durationS + 1e-6 || c.end - c.start < MIN_CLIP_S - 1e-6) errors.push(`clip:${c.id}`);
  }
  for (const track of TRACKS) {
    const list = doc.clips.filter((c) => c.track === track).sort((a, b) => a.start - b.start);
    for (let i = 1; i < list.length; i++) if (list[i]!.start < list[i - 1]!.end - 1e-6) errors.push(`overlap:${track}`);
  }
  return errors;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function aspectCss(a: AspectRatio): string {
  return a.replace(':', ' / ');
}

export function exportSize(kind: 'image' | 'video', aspect: AspectRatio): { width: number; height: number } {
  if (kind === 'video') {
    return aspect === '9:16' ? { width: 1080, height: 1920 } : aspect === '1:1' ? { width: 1080, height: 1080 } : { width: 1920, height: 1080 };
  }
  return aspect === '4:5' ? { width: 1638, height: 2048 } : aspect === '16:9' ? { width: 2048, height: 1152 } : { width: 2048, height: 2048 };
}

export const defaultImageScene = (): ImageScene => ({
  preset: 'nature',
  backgroundColor: '#b9c9a5',
  light: 'natural',
  camera: 'front',
  shadow: 0.7,
  aspect: '1:1',
  zoom: 100,
  lockLabel: true,
  hidden: [],
});

export const SPEEDS: readonly SpeedPreset[] = ['slow', 'normal', 'fast'];
