import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { aspectToSize, directFromRules, normalizeTimeline, Timeline, timelineJsonSchema, timelineToRenderMapping } from '../src/index.js';
import { OutputSpec } from '@aps/shared';

const base = {
  version: 1,
  aspect: '16:9',
  duration_s: 10,
  fps: 30,
  tracks: { product: [{ t: 0, t_end: 10, motion: 'spin360' }], camera: [], logo: [] },
};

describe('Timeline schema', () => {
  it('điền giá trị mặc định', () => {
    const t = Timeline.parse(base);
    expect(t.lock_label).toBe(true);
    expect(t.scene).toEqual({ template_id: 'studio-soft', hide: [], palette: 'brand' });
    expect(t.tracks.product[0]).toMatchObject({ turns: 1, speed: 'normal', ease: 'smooth' });
  });

  it.each([
    ['khoá lạ ở gốc', { ...base, bpy: 'x' }],
    ['khoá lạ trong đoạn', { ...base, tracks: { ...base.tracks, product: [{ t: 0, t_end: 5, motion: 'spin360', code: 'x' }] } }],
    ['version sai', { ...base, version: 2 }],
    ['tỷ lệ lạ', { ...base, aspect: '21:9' }],
    ['t_end ≤ t', { ...base, tracks: { ...base.tracks, product: [{ t: 5, t_end: 5, motion: 'still' }] } }],
    ['vượt duration', { ...base, tracks: { ...base.tracks, product: [{ t: 0, t_end: 11, motion: 'still' }] } }],
    ['chồng lấn', { ...base, tracks: { ...base.tracks, camera: [{ t: 0, t_end: 6, move: 'orbit' }, { t: 5, t_end: 9, move: 'dolly_in' }] } }],
    ['fps không nguyên', { ...base, fps: 29.97 }],
    ['template_id chứa ký tự nguy hiểm', { ...base, scene: { template_id: '../../etc/passwd' } }],
    ['hide ngoài enum', { ...base, scene: { hide: ['everything'] } }],
  ])('từ chối: %s', (_name, input) => {
    expect(Timeline.safeParse(input).success).toBe(false);
  });

  it('JSON Schema xuất ra khớp file schema/timeline.schema.json (chạy `pnpm --filter @aps/ai schema:export` nếu lệch)', () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../schema/timeline.schema.json');
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual(JSON.parse(JSON.stringify(timelineJsonSchema())));
  });
});

describe('normalizeTimeline', () => {
  it('không throw với rác', () => {
    for (const junk of [null, 42, 'x', [], undefined]) expect(normalizeTimeline(junk).ok).toBe(false);
  });

  it('kẹp, sắp xếp, cắt chồng và bỏ đoạn rỗng', () => {
    const r = normalizeTimeline({
      ...base,
      duration_s: 500,
      fps: 240,
      tracks: {
        product: [],
        camera: [
          { t: 6, t_end: 12, move: 'orbit', degrees: 999 },
          { t: -3, t_end: 8, move: 'dolly_in', amount: 5 },
          { t: 3, t_end: 3, move: 'static' },
        ],
      },
    });
    expect(r.ok).toBe(true);
    const t = r.timeline!;
    expect(t.duration_s).toBe(60);
    expect(t.fps).toBe(60);
    expect(t.tracks.camera).toHaveLength(2);
    expect(t.tracks.camera[0]).toMatchObject({ move: 'dolly_in', t: 0, t_end: 6, amount: 0.6 });
    expect(t.tracks.camera[1]).toMatchObject({ move: 'orbit', t: 6, t_end: 12, degrees: 360 });
  });

  it('báo lỗi cấu trúc thay vì sửa thầm', () => {
    const r = normalizeTimeline({ ...base, tracks: { ...base.tracks, camera: [{ t: 0, t_end: 3, move: 'warp' }] } });
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toContain('camera');
  });
});

describe('timelineToRenderMapping', () => {
  it('khớp OutputSpec của @aps/shared', () => {
    const { timeline } = directFromRules('Video dọc 12 giây, xoay chậm');
    const m = timelineToRenderMapping(timeline);
    expect(m.output).toMatchObject({ kind: 'video', width: 720, height: 1280, fps: 30, durationS: 12, motion: 'spin360' });
    expect(OutputSpec.safeParse(m.output).success).toBe(true);
  });

  it('cảnh báo phần worker v0 chưa hỗ trợ', () => {
    const { timeline } = directFromRules('Xoay chậm, camera tiến gần rồi quay quanh');
    const m = timelineToRenderMapping(timeline);
    expect(m.warnings.join()).toContain('worker_v0_single_motion');
    expect(m.warnings.join()).toContain('worker_v0_no_dolly');
  });

  it('kích thước luôn chẵn', () => {
    expect(aspectToSize('4:5', 720)).toEqual({ width: 720, height: 900 });
    expect(aspectToSize('16:9', 1080)).toEqual({ width: 1920, height: 1080 });
  });
});
