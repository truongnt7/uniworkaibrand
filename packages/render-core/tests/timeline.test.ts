import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { directFromRules, type TimelineInput } from '@aps/ai';
import { AppError, WorkerJob, WorkerJobV2, type Keyframe } from '@aps/shared';
import { buildFfmpegArgs, buildLogoFilter, buildTrack, compileTimelineJob, type TimelineCompileContext } from '../src/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(here, '..', '..', '..', 'blender-worker', 'tests', 'fixtures', 'job-v2.golden.json');
const promptsPath = join(here, '..', '..', 'ai', 'tests', 'golden', 'director-prompts.json');

const label = { imagePath: '/data/label.png', mode: 'cylinder' as const, centerDeg: 0 };
const ctx = (extra: Partial<TimelineCompileContext> = {}): TimelineCompileContext => ({
  jobId: 'j1',
  framesDir: '/w/frames',
  product: { glbPath: '/data/p.glb', label },
  logoPath: '/data/logo.png',
  ...extra,
});

const base = (over: Partial<TimelineInput> = {}): TimelineInput => ({
  version: 1,
  aspect: '16:9',
  duration_s: 10,
  fps: 30,
  tracks: { product: [], camera: [], logo: [] },
  ...over,
});

/** Nội suy tuyến tính (đủ để kiểm giá trị tại các keyframe và điểm giữa của ease linear). */
const valueAt = (track: readonly Keyframe[], t: number): number => {
  if (t <= track[0]!.t) return track[0]!.v;
  const last = track[track.length - 1]!;
  if (t >= last.t) return last.v;
  const i = track.findIndex((k, idx) => k.t <= t && t < track[idx + 1]!.t);
  const a = track[i]!;
  const b = track[i + 1]!;
  return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
};

describe('compileTimelineJob: các track', () => {
  it('sản phẩm: spin360 cộng 360 độ mỗi vòng, still giữ góc, giữ nguyên khi hết đoạn', () => {
    const { job } = compileTimelineJob(
      base({
        tracks: {
          product: [
            { t: 0, t_end: 4, motion: 'spin360', turns: 2, ease: 'linear' },
            { t: 4, t_end: 6, motion: 'still' },
            { t: 6, t_end: 10, motion: 'spin360', turns: 0.5, ease: 'linear' },
          ],
          camera: [],
          logo: [],
        },
      }),
      ctx(),
    );
    const rot = job.tracks.product.rotZDeg;
    expect(valueAt(rot, 0)).toBe(0);
    expect(valueAt(rot, 2)).toBeCloseTo(360);
    expect(valueAt(rot, 4)).toBeCloseTo(720);
    expect(valueAt(rot, 5)).toBeCloseTo(720);
    expect(valueAt(rot, 10)).toBeCloseTo(900);
    expect(rot.every((k, i) => i === 0 || k.t > rot[i - 1]!.t)).toBe(true);
  });

  it('camera: orbit cộng dồn góc (kể cả ngược chiều), dolly nhân khoảng cách, góc nâng theo `from`', () => {
    const { job } = compileTimelineJob(
      base({
        tracks: {
          product: [],
          camera: [
            { t: 0, t_end: 3, move: 'dolly_in', amount: 0.3, ease: 'linear', from: 'eye_level' },
            { t: 3, t_end: 6, move: 'orbit', degrees: 120, ease: 'linear', from: 'eye_level' },
            { t: 6, t_end: 10, move: 'orbit', degrees: -60, ease: 'linear', from: 'high' },
          ],
          logo: [],
        },
      }),
      ctx(),
    );
    const c = job.tracks.camera;
    expect(valueAt(c.distanceScale, 0)).toBeCloseTo(1);
    expect(valueAt(c.distanceScale, 3)).toBeCloseTo(0.7);
    expect(valueAt(c.distanceScale, 10)).toBeCloseTo(0.7);
    expect(valueAt(c.azimuthDeg, 6)).toBeCloseTo(120);
    expect(valueAt(c.azimuthDeg, 10)).toBeCloseTo(60);
    expect(valueAt(c.elevationDeg, 1)).toBeCloseTo(11);
    expect(valueAt(c.elevationDeg, 8)).toBeCloseTo(35);
  });

  it('dolly_out kẹp trong [0,35; 2,5] để camera không chui vào sản phẩm hay ra quá xa', () => {
    const segs = Array.from({ length: 8 }, (_, i) => ({ t: i, t_end: i + 1, move: 'dolly_out' as const, amount: 0.6 }));
    const { job } = compileTimelineJob(base({ tracks: { product: [], camera: segs, logo: [] } }), ctx());
    expect(Math.max(...job.tracks.camera.distanceScale.map((k) => k.v))).toBeLessThanOrEqual(2.5);
    const ins = Array.from({ length: 8 }, (_, i) => ({ t: i, t_end: i + 1, move: 'dolly_in' as const, amount: 0.6 }));
    const r = compileTimelineJob(base({ tracks: { product: [], camera: ins, logo: [] } }), ctx());
    expect(Math.min(...r.job.tracks.camera.distanceScale.map((k) => k.v))).toBeGreaterThanOrEqual(0.35);
  });

  it('đoạn đầu bắt đầu muộn: góc nâng đã đúng từ t=0 (không trôi), hai đoạn liền nhau đổi góc nâng bằng cắt cảnh', () => {
    const { job } = compileTimelineJob(
      base({
        tracks: {
          product: [],
          camera: [
            { t: 2, t_end: 5, move: 'static', from: 'low' },
            { t: 5, t_end: 8, move: 'static', from: 'high' },
          ],
          logo: [],
        },
      }),
      ctx(),
    );
    const el = job.tracks.camera.elevationDeg;
    expect(el[0]).toMatchObject({ t: 0, v: 2 });
    expect(valueAt(el, 1)).toBe(2);
    expect(valueAt(el, 4.999)).toBeCloseTo(2, 1);
    expect(valueAt(el, 5.01)).toBeCloseTo(35, 0);
  });

  it('buildTrack: keyframe luôn tăng nghiêm ngặt dù đoạn sát nhau', () => {
    const t = buildTrack(0, [
      { t0: 0, t1: 1, v1: 10, ease: 'linear' },
      { t0: 1, t1: 2, v1: 20, ease: 'linear' },
      { t0: 2.0004, t1: 3, v1: 30, ease: 'linear' },
    ]);
    expect(t.map((k) => k.t)).toEqual([0, 1, 2, 3]);
    expect(t.map((k) => k.v)).toEqual([0, 10, 20, 30]);
  });

  it('ánh sáng: luxury-dark quét đèn chính, studio-soft đứng yên; đoạn ánh sáng từ UI ghi đè theo thời gian', () => {
    const dark = compileTimelineJob(base({ scene: { template_id: 'luxury-dark', hide: [], palette: 'brand' } }), ctx()).job;
    expect(valueAt(dark.tracks.light.keyAzimuthDeg, 0)).toBeCloseTo(-15);
    expect(valueAt(dark.tracks.light.keyAzimuthDeg, 10)).toBeCloseTo(15);
    expect(dark.scene).toMatchObject({ template: 'luxury-dark', backgroundColor: '#241f1a' });

    const soft = compileTimelineJob(base(), ctx()).job;
    expect(soft.tracks.light.keyAzimuthDeg).toHaveLength(1);

    const lit = compileTimelineJob(base(), ctx({ extras: { lights: [{ t: 2, t_end: 4, rim_scale: 2.5, ease: 'linear' }] } })).job;
    expect(valueAt(lit.tracks.light.rimScale, 3)).toBeCloseTo(1.75);
    expect(valueAt(lit.tracks.light.rimScale, 9)).toBeCloseTo(2.5);
    expect(lit.tracks.light.keyScale).toHaveLength(1);
  });

  it('cảnh: palette ghi đè màu nền, brandColor dùng cho palette brand, mẫu lạ rơi về studio-soft kèm cảnh báo', () => {
    expect(compileTimelineJob(base({ scene: { template_id: 'studio-soft', hide: [], palette: 'cool' } }), ctx()).job.scene.backgroundColor).toBe('#dde6ee');
    expect(compileTimelineJob(base(), ctx({ brandColor: '#A1B2C3' })).job.scene.backgroundColor).toBe('#a1b2c3');
    const r = compileTimelineJob(base({ scene: { template_id: 'tet-holiday', hide: ['platform', 'leaves'], palette: 'brand' } }), ctx());
    expect(r.job.scene).toMatchObject({ template: 'studio-soft', hide: ['platform'] });
    expect(r.warnings.join('\n')).toMatch(/scene_template_unsupported/);
    expect(r.warnings.join('\n')).toMatch(/scene_hide_unsupported: .*leaves/);
  });

  it('logo/chữ: logo lấy từ timeline (thiếu ảnh logo thì bỏ kèm cảnh báo), chữ chỉ đến từ extras của UI', () => {
    const tl = base({ tracks: { product: [], camera: [], logo: [{ t: 8, t_end: 10, anim: 'slide_up', position: 'bottom_right' }] } });
    const withLogo = compileTimelineJob(tl, ctx({ extras: { text: [{ t: 1, tEnd: 4, text: 'Sữa rửa mặt dịu nhẹ', position: 'top_center' }] } }));
    expect(withLogo.job.overlays.logo).toEqual([{ t: 8, tEnd: 10, imagePath: '/data/logo.png', position: 'bottom_right', anim: 'slide_up' }]);
    expect(withLogo.job.overlays.text[0]).toMatchObject({ text: 'Sữa rửa mặt dịu nhẹ', color: '#ffffff', sizePct: 6 });
    const noLogo = compileTimelineJob(tl, ctx({ logoPath: undefined }));
    expect(noLogo.job.overlays.logo).toEqual([]);
    expect(noLogo.warnings.join('\n')).toMatch(/logo_missing/);
    expect(() => compileTimelineJob(base(), ctx({ extras: { text: [{ t: 3, tEnd: 99, text: 'x' }] } }))).toThrow(/text\[0\]/);
  });

  it('giữ nhãn: decal và lockLabel đi nguyên vào job, không có đường bỏ nhãn', () => {
    const { job } = compileTimelineJob(base(), ctx());
    expect(job.product.label).toEqual(label);
    expect(job.product.lockLabel).toBe(true);
    const nolabel = compileTimelineJob(base(), ctx({ product: { glbPath: '/a.glb' } }));
    expect(nolabel.warnings.join('\n')).toMatch(/label_not_provided/);
  });

  it('kích thước/khung: theo aspect, hoặc theo kích thước ép từ request (lệch tỉ lệ thì cảnh báo)', () => {
    expect(compileTimelineJob(base({ aspect: '9:16', duration_s: 2, fps: 24 }), ctx()).job).toMatchObject({
      render: { width: 720, height: 1280 },
      frames: { total: 48, fps: 24 },
    });
    const r = compileTimelineJob(base(), ctx({ width: 320, height: 320 }));
    expect(r.job.render).toMatchObject({ width: 320, height: 320 });
    expect(r.warnings.join('\n')).toMatch(/aspect_mismatch/);
  });

  it('job biên dịch ra luôn qua WorkerJob (union theo version) và schema chặt', () => {
    const { job } = compileTimelineJob(base(), ctx());
    expect(WorkerJob.parse(JSON.parse(JSON.stringify(job)))).toEqual(job);
    expect(() => WorkerJob.parse({ ...job, version: 3 })).toThrow();
    expect(() => WorkerJobV2.parse({ ...job, script: 'import bpy' })).toThrow();
    expect(() => WorkerJobV2.parse({ ...job, tracks: { ...job.tracks, camera: { ...job.tracks.camera, azimuthDeg: [] } } })).toThrow();
  });
});

describe('compileTimelineJob: đầu vào xấu', () => {
  it.each([
    ['khoá lạ (mã bpy)', { ...base(), script: 'import bpy; bpy.ops.wm.quit_blender()' }],
    ['version sai', { ...base(), version: 2 }],
    ['đoạn chồng nhau', base({ tracks: { product: [{ t: 0, t_end: 5, motion: 'spin360' }, { t: 4, t_end: 8, motion: 'still' }], camera: [], logo: [] } })],
    ['t_end vượt thời lượng', base({ duration_s: 4, tracks: { product: [{ t: 0, t_end: 9, motion: 'spin360' }], camera: [], logo: [] } })],
    ['không phải object', 'xoay chai'],
  ])('%s -> INVALID_TIMELINE', (_name, raw) => {
    try {
      compileTimelineJob(raw, ctx());
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).code).toBe('INVALID_TIMELINE');
    }
  });
});

describe('Đạo diễn AI -> job v2', () => {
  const prompts = JSON.parse(readFileSync(promptsPath, 'utf8')) as { id: string; prompt: string }[];
  it('mọi prompt golden (rule-based) đều biên dịch được thành job v2 hợp lệ, thời lượng khớp', () => {
    expect(prompts.length).toBeGreaterThanOrEqual(20);
    for (const { id, prompt } of prompts) {
      const { timeline } = directFromRules(prompt, { hasLogo: true });
      const { job } = compileTimelineJob(timeline, ctx());
      expect(job.frames.total, id).toBe(Math.max(1, Math.round(timeline.fps * timeline.duration_s)));
      expect(job.tracks.product.rotZDeg.length, id).toBeGreaterThanOrEqual(1);
      expect(job.product.lockLabel, id).toBe(true);
    }
  });
});

describe('golden job.json v2 (dùng chung với test Python)', () => {
  const timeline: TimelineInput = {
    version: 1,
    aspect: '16:9',
    duration_s: 4,
    fps: 15,
    tracks: {
      product: [{ t: 0, t_end: 4, motion: 'spin360', turns: 1, ease: 'linear' }],
      camera: [
        { t: 0, t_end: 2, move: 'dolly_in', amount: 0.2, ease: 'linear', from: 'eye_level' },
        { t: 2, t_end: 4, move: 'orbit', degrees: 90, ease: 'linear', from: 'high' },
      ],
      logo: [{ t: 3, t_end: 4, anim: 'fade_in', position: 'bottom_center' }],
    },
    scene: { template_id: 'luxury-dark', hide: [], palette: 'brand' },
    lock_label: true,
  };
  const build = () =>
    compileTimelineJob(
      timeline,
      ctx({
        jobId: 'golden',
        framesDir: '/tmp/frames',
        width: 256,
        height: 144,
        samples: 4,
        extras: {
          text: [{ t: 0.5, tEnd: 3, text: 'Dịu nhẹ cho làn da', position: 'top_center', anim: 'slide_up' }],
          lights: [{ t: 1, t_end: 2, rim_scale: 2, ease: 'linear' }],
        },
      }),
    ).job;

  it('khớp file golden (UPDATE_GOLDEN=1 để ghi lại)', () => {
    const json = `${JSON.stringify(build(), null, 2)}\n`;
    if (process.env.UPDATE_GOLDEN === '1' || !existsSync(goldenPath)) {
      mkdirSync(dirname(goldenPath), { recursive: true });
      writeFileSync(goldenPath, json);
    }
    expect(readFileSync(goldenPath, 'utf8')).toBe(json);
    expect(WorkerJob.parse(JSON.parse(json)).version).toBe(2);
  });
});

describe('ffmpeg: logo theo timeline', () => {
  const o = { framesDir: '/w/frames', outputPath: '/w/out.mp4', fps: 30, width: 1280, height: 720, durationS: 10 };
  const logo = { t: 8, tEnd: 10, imagePath: '/data/logo.png', position: 'bottom_right' as const, anim: 'slide_up' as const };

  it('thêm input -loop cho từng logo, enable theo [t, tEnd], biểu thức đặt trong nháy đơn', () => {
    const args = buildFfmpegArgs({ ...o, logos: [logo, { ...logo, t: 1, tEnd: 3, position: 'top_left', anim: 'none' }] });
    expect(args.filter((a) => a === '-loop')).toHaveLength(2);
    expect(args).toContain('/data/logo.png');
    const graph = args[args.indexOf('-filter_complex') + 1]!;
    expect(graph).toContain("enable='between(t,8,10)'");
    expect(graph).toContain("enable='between(t,1,3)'");
    expect(graph).toContain('fade=t=in:st=8:d=0.5:alpha=1');
    expect(graph).toMatch(/y='H-h-43\+\(1-min\(1,max\(0,\(t-8\)\/0.5\)\)\)\*36'/);
    expect(graph.endsWith('[vcat]format=yuv420p[v]')).toBe(true);
    expect(args).toContain('[v]');
    expect(args).toContain('libopenh264');
  });

  it('không có logos thì giữ hành vi cũ (logoPath cuối video)', () => {
    const args = buildFfmpegArgs({ ...o, logoPath: '/data/logo.png' });
    expect(args[args.indexOf('-filter_complex') + 1]).toContain('overlay=x=(W-w)/2');
    expect(buildLogoFilter([logo], o).inputs).toBe(1);
  });
});
