import { LIMITS, Timeline, type Timeline as TimelineT } from './schema.js';

const round = (n: number, digits = 2): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export interface NormalizeResult {
  ok: boolean;
  timeline?: TimelineT;
  /** Các chỉnh sửa đã áp (kẹp giá trị, cắt chồng lấn, ép lock_label…). */
  fixes: string[];
  /** Lỗi còn lại sau chuẩn hoá (khi ok = false). */
  errors: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeTrack(name: string, raw: unknown, duration: number, fixes: string[]): unknown {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return raw;
  const segs = raw.filter(isRecord).map((s) => ({ ...s }));
  for (const s of segs) {
    if (typeof s.t === 'number') {
      const t = round(clamp(s.t, 0, duration));
      if (t !== s.t) fixes.push(`${name}: kẹp t=${s.t} về [0, ${duration}]`);
      s.t = t;
    }
    if (typeof s.t_end === 'number') {
      const e = round(clamp(s.t_end, 0, duration));
      if (e !== s.t_end) fixes.push(`${name}: kẹp t_end=${s.t_end} về [0, ${duration}]`);
      s.t_end = e;
    }
  }
  const isTimed = (s: Record<string, unknown>) => typeof s.t === 'number' && typeof s.t_end === 'number';
  const valid = segs.filter(isTimed);
  const untimed = segs.filter((s) => !isTimed(s));
  const kept = valid.filter((s) => (s.t_end as number) > (s.t as number));
  if (kept.length !== valid.length) fixes.push(`${name}: bỏ đoạn có độ dài ≤ 0`);
  kept.sort((a, b) => (a.t as number) - (b.t as number));
  for (let i = 1; i < kept.length; i++) {
    const prev = kept[i - 1]!;
    const cur = kept[i]!;
    if ((cur.t as number) < (prev.t_end as number)) {
      fixes.push(`${name}: cắt đoạn ${i - 1} để không chồng lấn`);
      prev.t_end = cur.t;
    }
  }
  const out = kept.filter((s) => (s.t_end as number) > (s.t as number));
  // Giữ các phần tử sai cấu trúc để zod báo lỗi đúng chỗ thay vì lặng lẽ bỏ.
  return [...out, ...untimed, ...raw.filter((s) => !isRecord(s))];
}

function clampField(obj: Record<string, unknown>, key: string, lo: number, hi: number, label: string, fixes: string[], digits = 2): void {
  const v = obj[key];
  if (typeof v !== 'number' || Number.isNaN(v)) return;
  const c = round(clamp(v, lo, hi), digits);
  if (c !== v) fixes.push(`${label}.${key}: kẹp ${v} về [${lo}, ${hi}]`);
  obj[key] = c;
}

/**
 * Chuẩn hoá nhẹ đầu ra (thường từ LLM) trước khi validate: kẹp giá trị vào giới hạn, sắp xếp/cắt chồng lấn,
 * ép lock_label = true. KHÔNG thêm khoá lạ, KHÔNG sửa enum: đầu ra sai cấu trúc sẽ bị từ chối.
 */
export function normalizeTimeline(raw: unknown): NormalizeResult {
  const fixes: string[] = [];
  if (!isRecord(raw)) return { ok: false, fixes, errors: ['Đầu ra không phải đối tượng JSON'] };
  const tl: Record<string, unknown> = { ...raw };

  clampField(tl, 'duration_s', LIMITS.durationS.min, LIMITS.durationS.max, 'timeline', fixes);
  if (typeof tl.fps === 'number') {
    const f = Math.round(clamp(tl.fps, LIMITS.fps.min, LIMITS.fps.max));
    if (f !== tl.fps) fixes.push(`timeline.fps: kẹp ${tl.fps} về [${LIMITS.fps.min}, ${LIMITS.fps.max}]`);
    tl.fps = f;
  }
  const duration = typeof tl.duration_s === 'number' ? tl.duration_s : LIMITS.durationS.max;

  if (tl.lock_label !== true) {
    if (tl.lock_label === false) fixes.push('lock_label: ép về true (AI không được tắt giữ nhãn)');
    tl.lock_label = true;
  }

  if (isRecord(tl.tracks)) {
    const tracks: Record<string, unknown> = { ...tl.tracks };
    for (const name of ['product', 'camera', 'logo'] as const) {
      tracks[name] = normalizeTrack(name, tracks[name], duration, fixes);
      const list = tracks[name];
      if (Array.isArray(list)) {
        for (const seg of list) {
          if (!isRecord(seg)) continue;
          if (name === 'product') clampField(seg, 'turns', LIMITS.turns.min, LIMITS.turns.max, 'product', fixes);
          if (name === 'camera') {
            clampField(seg, 'degrees', LIMITS.orbitDegrees.min, LIMITS.orbitDegrees.max, 'camera', fixes, 1);
            clampField(seg, 'amount', LIMITS.dollyAmount.min, LIMITS.dollyAmount.max, 'camera', fixes);
          }
        }
      }
    }
    tl.tracks = tracks;
  }

  const parsed = Timeline.safeParse(tl);
  if (parsed.success) return { ok: true, timeline: parsed.data, fixes, errors: [] };
  return {
    ok: false,
    fixes,
    errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}
