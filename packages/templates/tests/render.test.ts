import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderSlideshow } from '@aps/render-core';
import { allTemplates, compileTemplate, getTemplate, type Template } from '../src/index.js';
import { findLgplFfmpeg, findVietnameseFont, frameAt, makeImage, meanAbsDiff, pixel, probe } from './helpers/media.js';

const FF = findLgplFfmpeg();
const FONT = findVietnameseFont();

/**
 * End-to-end thật: mẫu JSON -> dữ liệu người dùng -> SlideshowJob -> ffmpeg LGPL -> mp4.
 * Cần binary LGPL đã ghim (`node tools/ffmpeg/fetch-lgpl.mjs` hoặc APS_TEST_FFMPEG_LGPL) và một font có tiếng Việt; thiếu thì bỏ qua.
 */
describe.skipIf(FF === '' || FONT === '')('mẫu -> mp4 bằng ffmpeg LGPL', () => {
  let dir = '';
  let imgs: string[] = [];
  let logo = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aps-tpl-'));
    mkdirSync(dir, { recursive: true });
    const sources = ['testsrc2=s=1600x1200', 'gradients=s=1200x1600:seed=3', 'smptebars=s=1280x720', 'mandelbrot=s=1000x1000'];
    imgs = sources.map((s, i) => {
      const p = join(dir, `anh${i}.jpg`);
      makeImage(FF, p, s);
      return p;
    });
    logo = join(dir, 'logo.png');
    makeImage(FF, logo, 'color=c=0xff0000:s=240x240');
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const userFor = (t: Template, onlyRequired = false) => {
    const values: Record<string, string> = {};
    for (const f of t.fields) if (!onlyRequired || f.required) values[f.key] = f.example;
    const photos: Record<string, string> = {};
    const captions: Record<string, string> = {};
    t.photos.forEach((p, i) => {
      if (onlyRequired && !p.required) return;
      photos[p.id] = imgs[i % imgs.length]!;
      if (p.caption) captions[p.id] = p.caption.example;
    });
    return { values, photos, captions };
  };

  it.each(allTemplates().map((t) => [t.id, t] as const))('%s: render xem trước ra mp4 H.264 yuv420p đúng kích thước và số khung', async (_id, t) => {
    const { job } = compileTemplate(t, userFor(t), { jobId: t.id, fontPath: FONT, quality: 'preview', logoPath: logo });
    const out = join(dir, `${t.id}.mp4`);
    const r = await renderSlideshow(job, { ffmpegPath: FF, outputPath: out });
    const p = probe(FF, out);
    expect(p).toMatchObject({ codec: 'h264', pixFmt: 'yuv420p', width: job.output.width, height: job.output.height });
    expect(p.frames).toBe(r.totalFrames);
    expect(p.durationS).toBeCloseTo(r.durationS, 1);
  }, 120_000);

  it('chỉ với ảnh và trường bắt buộc vẫn ra video hợp lệ (cảnh/ chữ tuỳ chọn bị bỏ)', async () => {
    const t = getTemplate('bhol-gioi-thieu-san-pham')!;
    const { job } = compileTemplate(t, userFor(t, true), { jobId: 'min', fontPath: FONT, quality: 'preview' });
    const out = join(dir, 'min.mp4');
    await renderSlideshow(job, { ffmpegPath: FF, outputPath: out });
    expect(probe(FF, out).durationS).toBeCloseTo(3.5 + 4 - 0.5, 1);
  }, 120_000);

  it('thẻ cuối có màu thương hiệu, có logo ở đầu thẻ cuối và chữ liên hệ; logo không có ở khung đầu', async () => {
    const t = getTemplate('nh-mon-moi')!;
    const { job } = compileTemplate(t, userFor(t), { jobId: 'end', fontPath: FONT, quality: 'preview', logoPath: logo, brandColor: '#0b3d91' });
    const out = join(dir, 'end.mp4');
    await renderSlideshow(job, { ffmpegPath: FF, outputPath: out });
    const { width: w, height: h } = job.output;
    const last = frameAt(FF, out, probe(FF, out).durationS - 0.3, w, h);
    const first = frameAt(FF, out, 0.2, w, h);
    const bg = pixel(last, w, 8, Math.round(h * 0.35));
    expect(Math.abs(bg[0] - 0x0b)).toBeLessThan(14);
    expect(Math.abs(bg[2] - 0x91)).toBeLessThan(14);
    const logoSpot = pixel(last, w, Math.round(w / 2), Math.round(h * 0.05 + h * 0.05));
    expect(logoSpot[0]).toBeGreaterThan(200);
    expect(logoSpot[1]).toBeLessThan(60);
    expect(pixel(first, w, Math.round(w / 2), Math.round(h * 0.1))[0]).not.toBeGreaterThan(240);
    const bare = { ...job, scenes: job.scenes.map((sc, i) => (i === job.scenes.length - 1 ? { ...sc, texts: [] } : sc)) };
    const bareOut = join(dir, 'end-bare.mp4');
    await renderSlideshow(bare, { ffmpegPath: FF, outputPath: bareOut });
    const bareLast = frameAt(FF, bareOut, probe(FF, bareOut).durationS - 0.3, w, h);
    expect(meanAbsDiff(last, bareLast)).toBeGreaterThan(0.5);
  }, 120_000);
});
