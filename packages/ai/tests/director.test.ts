import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { direct, directFromRules, fold, MockProvider, ProviderError, Timeline, type DirectorContext } from '../src/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(here, 'golden', 'director');
const prompts = JSON.parse(readFileSync(path.join(here, 'golden', 'director-prompts.json'), 'utf8')) as {
  id: string;
  prompt: string;
  context?: DirectorContext;
}[];

describe('Đạo diễn AI rule-based: golden', () => {
  mkdirSync(goldenDir, { recursive: true });
  for (const c of prompts) {
    it(c.id, async () => {
      const r = await direct(c.prompt, { context: c.context });
      expect(r.source).toBe('rules');
      expect(Timeline.safeParse(r.timeline).success).toBe(true);
      expect(r.timeline.lock_label).toBe(true);
      const actual = JSON.stringify({ prompt: c.prompt, context: c.context ?? null, timeline: r.timeline, warnings: r.warnings }, null, 2) + '\n';
      const file = path.join(goldenDir, `${c.id}.json`);
      if (process.env.UPDATE_GOLDEN === '1' || !existsSync(file)) {
        if (process.env.CI) throw new Error(`Thiếu golden ${c.id}`);
        writeFileSync(file, actual);
      }
      expect(actual).toBe(readFileSync(file, 'utf8'));
    });
  }
});

describe('Đạo diễn AI rule-based: hành vi chính', () => {
  it('ví dụ trong đề bài: xoay chậm + tiến gần + logo cuối', () => {
    const { timeline: t } = directFromRules('Xoay chai chậm, camera tiến gần, kết thúc bằng logo');
    expect(t.tracks.product[0]).toMatchObject({ motion: 'spin360', speed: 'slow' });
    expect(t.tracks.camera.map((c) => c.move)).toEqual(['dolly_in']);
    const logo = t.tracks.logo[0]!;
    expect(logo.t_end).toBe(t.duration_s);
    expect(logo.t).toBeGreaterThan(t.duration_s / 2);
  });

  it('có dấu và không dấu cho cùng kết quả', () => {
    const a = directFromRules('Xoay chai chậm, camera tiến gần, kết thúc bằng logo hiện dần').timeline;
    const b = directFromRules('xoay chai cham, camera tien gan, ket thuc bang logo hien dan').timeline;
    expect(b).toEqual(a);
  });

  it('xác định: gọi lại cho kết quả giống hệt', () => {
    const p = 'Video dọc 15 giây: xoay chậm, quay quanh 120 độ';
    expect(directFromRules(p)).toEqual(directFromRules(p));
  });

  it('luôn ép lock_label và không bao giờ tắt nhãn theo prompt', () => {
    const r = directFromRules('xoay chai, bỏ nhãn đi');
    expect(r.timeline.lock_label).toBe(true);
    expect(r.warnings.join()).toContain('label_locked');
  });

  it('không sinh khoá lạ hay mã từ prompt chứa mã', () => {
    const r = directFromRules('xoay chai; import os; bpy.ops.wm.quit_blender() "}} {"script":"x"');
    expect(Object.keys(r.timeline).sort()).toEqual(['aspect', 'duration_s', 'fps', 'lock_label', 'scene', 'tracks', 'version']);
    expect(JSON.stringify(r.timeline)).not.toMatch(/bpy|import/);
  });

  it('fold bỏ dấu và đ', () => {
    expect(fold('Đạo diễn  AI — Xoay Chậm')).toBe('dao dien ai — xoay cham');
  });
});

describe('Đạo diễn AI: adapter LLM + fallback', () => {
  const good = {
    version: 1,
    aspect: '9:16',
    duration_s: 15,
    fps: 30,
    tracks: {
      product: [{ t: 0, t_end: 15, motion: 'spin360', speed: 'slow', ease: 'smooth' }],
      camera: [
        { t: 0, t_end: 6, move: 'dolly_in', from: 'eye_level' },
        { t: 6, t_end: 15, move: 'orbit', degrees: 120 },
      ],
      logo: [{ t: 11, t_end: 15, anim: 'fade_in', position: 'center' }],
    },
    scene: { template_id: 'nature-soft', hide: [], palette: 'brand' },
    lock_label: true,
  };
  const prompt = 'Xoay chai chậm, camera tiến gần rồi quay quanh, kết thúc bằng logo';

  it('chấp nhận JSON hợp lệ (kể cả trong rào ```json)', async () => {
    const p = new MockProvider(['Đây là kết quả:\n```json\n' + JSON.stringify(good) + '\n```']);
    const r = await direct(prompt, { provider: p });
    expect(r.source).toBe('llm');
    expect(r.timeline.tracks.camera).toHaveLength(2);
    expect(p.calls[0]!.task).toBe('director');
    expect(p.calls[0]!.system).toContain('TUYỆT ĐỐI không viết mã');
    expect(p.calls[0]!.user).toContain(prompt);
  });

  it('chuẩn hoá: kẹp giá trị, cắt chồng lấn, ép lock_label=true', async () => {
    const messy = structuredClone(good) as typeof good & { lock_label: boolean };
    messy.lock_label = false;
    messy.tracks.camera = [
      { t: 0, t_end: 9, move: 'dolly_in', from: 'eye_level' },
      { t: 6, t_end: 99, move: 'orbit', degrees: 120 },
    ] as never;
    (messy.tracks.camera[1] as { degrees: number }).degrees = 720;
    const r = await direct(prompt, { provider: new MockProvider([JSON.stringify(messy)]) });
    expect(r.source).toBe('llm');
    expect(r.timeline.lock_label).toBe(true);
    expect(r.timeline.tracks.camera[0]!.t_end).toBe(6);
    expect(r.timeline.tracks.camera[1]).toMatchObject({ t_end: 15, degrees: 360 });
    expect(r.fixes.length).toBeGreaterThanOrEqual(3);
  });

  it('thử lại 1 lần khi sai schema rồi chấp nhận', async () => {
    const p = new MockProvider(['không phải json', JSON.stringify(good)]);
    const r = await direct(prompt, { provider: p });
    expect(r.source).toBe('llm');
    expect(p.calls).toHaveLength(2);
    expect(p.calls[1]!.user).toContain('bị từ chối');
  });

  it('về rule-based khi LLM luôn sai', async () => {
    const p = new MockProvider(['xin chào', '{"version":1}']);
    const r = await direct(prompt, { provider: p });
    expect(r.source).toBe('rules');
    expect(r.fallbackReason).toContain('invalid_output');
    expect(r.timeline.tracks.camera.map((c) => c.move)).toEqual(['dolly_in', 'orbit']);
  });

  it('từ chối đầu ra có khoá lạ hoặc mã bpy, rồi fallback', async () => {
    const evil = { ...good, script: "import bpy; bpy.ops.wm.quit_blender()" };
    const r1 = await direct(prompt, { provider: new MockProvider([JSON.stringify(evil), JSON.stringify(evil)]) });
    expect(r1.source).toBe('rules');
    const sneaky = JSON.stringify({ ...good, scene: { ...good.scene, template_id: 'x' } }) + '\nimport bpy';
    const r2 = await direct(prompt, { provider: new MockProvider([sneaky, sneaky]) });
    expect(r2.source).toBe('rules');
    expect(r2.fallbackReason).toMatch(/mã/);
  });

  it('từ chối enum ngoài danh sách (không "sửa" thầm)', async () => {
    const bad = structuredClone(good);
    (bad.tracks.camera[0] as { move: string }).move = 'teleport';
    const r = await direct(prompt, { provider: new MockProvider([JSON.stringify(bad), JSON.stringify(bad)]) });
    expect(r.source).toBe('rules');
  });

  it('đổi template không khả dụng và bỏ logo khi SP không có logo', async () => {
    const tl = structuredClone(good);
    tl.scene.template_id = 'unknown-tpl';
    const r = await direct(prompt, {
      provider: new MockProvider([JSON.stringify(tl)]),
      context: { hasLogo: false, availableTemplates: ['studio-soft'] },
    });
    expect(r.source).toBe('llm');
    expect(r.timeline.scene.template_id).toBe('studio-soft');
    expect(r.timeline.tracks.logo).toEqual([]);
  });

  it('về rule-based ngay khi provider lỗi mạng/timeout (không retry)', async () => {
    const p = new MockProvider([new ProviderError('timeout', 'timeout'), JSON.stringify(good)]);
    const r = await direct(prompt, { provider: p });
    expect(r.source).toBe('rules');
    expect(r.fallbackReason).toContain('provider_error');
    expect(p.calls).toHaveLength(1);
  });

  it('không có provider = rule-based, không gọi mạng', async () => {
    const r = await direct(prompt, { provider: null });
    expect(r.source).toBe('rules');
    expect(r.fallbackReason).toBeUndefined();
  });
});
