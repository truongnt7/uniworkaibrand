import { describe, expect, it } from 'vitest';
import { MockDirectorService } from '../src/services/mock/director';
import { applyMotion, defaultTimeline, setDuration, updateClip, validateTimeline } from '../src/services/timeline';

describe('timeline JSON', () => {
  it('timeline mặc định khớp thiết kế (xoay 360°, tiến gần -> quay quanh, logo hiện dần) và hợp lệ', () => {
    const doc = defaultTimeline();
    expect(doc.durationS).toBe(15);
    expect(doc.lockLabel).toBe(true);
    expect(doc.clips.map((c) => `${c.track}:${c.kind}`)).toEqual(['product:spin360', 'camera:dolly_in', 'camera:orbit', 'logo:fade_in']);
    expect(validateTimeline(doc)).toEqual([]);
  });

  it('đổi tổng thời lượng co giãn tỉ lệ các clip và vẫn hợp lệ', () => {
    const doc = setDuration(defaultTimeline(), 10);
    expect(doc.durationS).toBe(10);
    expect(Math.max(...doc.clips.map((c) => c.end))).toBe(10);
    expect(validateTimeline(doc)).toEqual([]);
  });

  it('sửa clip bị kẹp trong biên, không chồng lấn và giữ thời lượng tối thiểu', () => {
    const doc = defaultTimeline();
    const dolly = doc.clips.find((c) => c.kind === 'dolly_in')!;
    const orbit = doc.clips.find((c) => c.kind === 'orbit')!;
    const longer = updateClip(doc, dolly.id, { end: 12 });
    expect(longer.clips.find((c) => c.id === dolly.id)!.end).toBe(orbit.start);
    const tiny = updateClip(doc, dolly.id, { end: 0 });
    const t = tiny.clips.find((c) => c.id === dolly.id)!;
    expect(t.end - t.start).toBeGreaterThanOrEqual(0.5);
    const outside = updateClip(doc, orbit.id, { end: 99 });
    expect(outside.clips.find((c) => c.id === orbit.id)!.end).toBe(15);
    const eased = updateClip(doc, orbit.id, { ease: 'easeOut' });
    expect(eased.clips.find((c) => c.id === orbit.id)!.ease).toBe('easeOut');
    for (const d of [longer, tiny, outside, eased]) expect(validateTimeline(d)).toEqual([]);
  });

  it('validateTimeline phát hiện clip vượt biên hoặc chồng lấn', () => {
    const doc = defaultTimeline();
    expect(validateTimeline({ ...doc, clips: [{ ...doc.clips[0]!, end: 99 }] })).toContain('clip:product-1');
    const overlap = { ...doc, clips: [...doc.clips, { id: 'x', track: 'camera' as const, kind: 'orbit', start: 1, end: 3, ease: 'smooth' as const }] };
    expect(validateTimeline(overlap)).toContain('overlap:camera');
  });

  it('applyMotion dựng lại clip theo chuyển động', () => {
    const doc = applyMotion(defaultTimeline(), 'orbit');
    expect(doc.motion).toBe('orbit');
    expect(doc.clips.find((c) => c.track === 'camera')!.kind).toBe('orbit');
  });
});

describe('Đạo diễn AI (mock)', () => {
  const director = new MockDirectorService();

  it('prompt trong thiết kế -> xoay chậm, tiến gần, kết thúc bằng logo', async () => {
    const base = applyMotion(defaultTimeline({ speed: 'fast' }), 'orbit');
    const res = await director.directVideo('Xoay chai chậm, camera tiến gần, kết thúc bằng logo...', base);
    expect(res.timeline.motion).toBe('spin360');
    expect(res.timeline.speed).toBe('slow');
    expect(res.timeline.hidden).not.toContain('logo');
    expect(res.timeline.lockLabel).toBe(true);
    expect(validateTimeline(res.timeline)).toEqual([]);
  });

  it('đọc thời lượng và tỷ lệ, luôn trả timeline hợp lệ', async () => {
    const res = await director.directVideo('quay quanh nhanh 10 giây dọc', defaultTimeline());
    expect(res.timeline.motion).toBe('orbit');
    expect(res.timeline.speed).toBe('fast');
    expect(res.timeline.durationS).toBe(10);
    expect(res.timeline.aspect).toBe('9:16');
    expect(validateTimeline(res.timeline)).toEqual([]);
    const crazy = await director.directVideo('xoay 9999 giây', defaultTimeline());
    expect(validateTimeline(crazy.timeline)).toEqual([]);
  });

  it('prompt ảnh đổi bối cảnh và ánh sáng nhưng giữ nguyên nhãn', async () => {
    const res = await director.directImage('Đổi nền tối giản, ánh sáng mềm', { preset: 'nature', backgroundColor: '#b9c9a5', light: 'natural', camera: 'front', shadow: 0.7, aspect: '1:1', zoom: 100, lockLabel: false, hidden: [] });
    expect(res.scene.preset).toBe('minimal');
    expect(res.scene.light).toBe('soft');
    expect(res.scene.lockLabel).toBe(true);
  });
});
