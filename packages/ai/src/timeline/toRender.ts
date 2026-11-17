import type { OutputSpec } from '@aps/shared';
import type { Aspect, Timeline } from './schema.js';

export interface RenderMapping {
  output: Pick<OutputSpec, 'kind' | 'width' | 'height' | 'fps' | 'durationS' | 'motion'>;
  /** Phần timeline mà blender-worker v0 chưa biểu diễn được (worker hiện chỉ có 1 chuyển động toàn đoạn). */
  warnings: string[];
}

const RATIO: Record<Aspect, [number, number]> = { '16:9': [16, 9], '9:16': [9, 16], '1:1': [1, 1], '4:5': [4, 5] };

export function aspectToSize(aspect: Aspect, shortSide = 720): { width: number; height: number } {
  const [w, h] = RATIO[aspect];
  const scale = shortSide / Math.min(w, h);
  const even = (n: number) => Math.round(n / 2) * 2;
  return { width: even(w * scale), height: even(h * scale) };
}

/**
 * Cầu nối tối thiểu timeline → OutputSpec của @aps/shared (đang dùng bởi render-core).
 * Biên dịch đầy đủ nhiều track → job.json là việc của render-core (ngoài phạm vi lớp AI).
 */
export function timelineToRenderMapping(tl: Timeline, shortSide = 720): RenderMapping {
  const warnings: string[] = [];
  const spin = tl.tracks.product.find((s) => s.motion === 'spin360');
  const orbit = tl.tracks.camera.find((s) => s.move === 'orbit');
  const motion = spin ? 'spin360' : orbit ? 'orbit' : 'orbit';
  if (!spin && !orbit) warnings.push('worker_v0_no_matching_motion: không có spin360/orbit, dùng orbit mặc định');
  if (spin && orbit) warnings.push('worker_v0_single_motion: chỉ áp dụng spin360, bỏ qua camera orbit');
  if (tl.tracks.camera.some((s) => s.move === 'dolly_in' || s.move === 'dolly_out')) {
    warnings.push('worker_v0_no_dolly: worker v0 chưa hỗ trợ dolly');
  }
  if (tl.tracks.product.length > 1 || tl.tracks.camera.length > 1) {
    warnings.push('worker_v0_single_segment: worker v0 chưa hỗ trợ nhiều đoạn trên một track');
  }
  return {
    output: { kind: 'video', ...aspectToSize(tl.aspect, shortSide), fps: tl.fps, durationS: tl.duration_s, motion },
    warnings,
  };
}
