import { copyFileSync, mkdtempSync, rmSync, statSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppError, SlideshowJob, type SlideshowJobInput } from '@aps/shared';
import { escapeFilterPath, fitText, planSlideshow, renderSlideshow, wrapText, collageLayout } from '../src/index.js';
import { findLgplFfmpeg, findVietnameseFont, frameAt, makeImage, meanAbsDiff, pixel, probe, run } from './helpers/media.js';

const FF = findLgplFfmpeg();
const FONT = findVietnameseFont();
const canRender = FF !== '' && FONT !== '';

const base = (scenes: SlideshowJobInput['scenes'], extra: Partial<SlideshowJobInput> = {}): SlideshowJobInput => ({
  version: 1,
  kind: 'slideshow',
  jobId: 't1',
  output: { width: 360, height: 640, fps: 25 },
  fontPath: FONT || '/font.ttf',
  scenes,
  ...extra,
});

describe('wrapText / fitText', () => {
  it('xuống dòng theo từ, giữ số điện thoại (NBSP) trên một dòng', () => {
    const phone = '0901\u00a0234\u00a0567';
    const lines = wrapText(`Gọi ngay: ${phone}`, 12);
    expect(lines).toEqual(['Gọi ngay:', phone]);
  });

  it('chữ tiếng Việt dài được co/xuống dòng tối đa 4 dòng và không mất chữ khi vừa', () => {
    const r = fitText('Nhôm kính Hoàng Gia thi công trọn gói cửa đi cửa sổ vách tắm lan can', 'title', 540, 960);
    expect(r.lines.length).toBeLessThanOrEqual(4);
    expect(r.lines.join(' ')).toContain('Nhôm kính Hoàng Gia');
    expect(r.fontSize).toBeGreaterThan(20);
  });

  it('quá dài thì cắt bằng dấu …, không bao giờ vượt 4 dòng', () => {
    const r = fitText('từ '.repeat(200), 'title', 540, 960);
    expect(r.lines).toHaveLength(4);
    expect(r.lines[3]!.endsWith('…')).toBe(true);
  });

  it('bỏ ký tự điều khiển và chuẩn hoá NFC', () => {
    const r = fitText('Ca\u0302\u0301 \u0000x', 'body', 540, 960);
    expect(r.lines.join('')).not.toContain('\u0000');
  });
});

describe('escapeFilterPath', () => {
  it('bọc nháy đơn, đổi \\ thành / và escape dấu :', () => {
    expect(escapeFilterPath('C:\\Users\\An\\font.ttf')).toBe("'C\\:/Users/An/font.ttf'");
    expect(escapeFilterPath('/tmp/a b/c.ttf')).toBe("'/tmp/a b/c.ttf'");
  });
  it('từ chối nháy đơn và ký tự điều khiển (không để chúng thoát khỏi filtergraph)', () => {
    expect(() => escapeFilterPath("/tmp/a'b.ttf")).toThrowError(AppError);
    expect(() => escapeFilterPath('/tmp/a\nb.ttf')).toThrowError(AppError);
  });
});

describe('collageLayout', () => {
  it('2 ảnh: khung dọc xếp dọc, khung ngang xếp ngang; các ô phủ kín khung', () => {
    const v = collageLayout(2, 720, 1280);
    expect(v.cells.map((c) => [c.x, c.y, c.w, c.h])).toEqual([[0, 0, 720, 640], [0, 640, 720, 640]]);
    const h = collageLayout(2, 1280, 720);
    expect(h.cells.map((c) => [c.x, c.y, c.w, c.h])).toEqual([[0, 0, 640, 720], [640, 0, 640, 720]]);
    for (const n of [2, 3, 4]) {
      const l = collageLayout(n, 720, 1280);
      expect(l.cells.reduce((s, c) => s + c.w * c.h, 0)).toBe(720 * 1280);
    }
  });
});

describe('SlideshowJob schema', () => {
  const card = { type: 'card' as const, durationS: 3 };
  it('từ chối khoá lạ (script/exec) ở mọi mức', () => {
    expect(() => SlideshowJob.parse({ ...base([card]), script: 'x' })).toThrow();
    expect(() => SlideshowJob.parse(base([{ ...card, exec: 'x' } as never]))).toThrow();
  });
  it('từ chối kích thước lẻ, quá dài, chuyển cảnh dài hơn cảnh, chữ trùng vị trí cùng lúc', () => {
    expect(() => SlideshowJob.parse({ ...base([card]), output: { width: 361, height: 640, fps: 25 } })).toThrow(/chẵn/);
    expect(() => SlideshowJob.parse(base(Array.from({ length: 10 }, () => ({ ...card, durationS: 10, transition: 'none' as const }))))).toThrow(/tổng thời lượng/);
    expect(() => SlideshowJob.parse(base([card, { ...card, durationS: 1, transitionS: 1 }]))).toThrow(/transitionS/);
    const t = { text: 'a', position: 'top' as const };
    expect(() => SlideshowJob.parse(base([{ ...card, texts: [t, t] }]))).toThrow(/trùng vị trí/);
  });
});

describe('planSlideshow (thuần, không chạy ffmpeg)', () => {
  const dir = '/tmp/work';
  const job = base([
    { type: 'photo', imagePath: '/p/a b.jpg', durationS: 3, texts: [{ text: 'Giảm 20% %{pid} \'x\' ; [v] "q"', position: 'bottom' }] },
    { type: 'card', durationS: 3 },
  ]);

  it('văn bản người dùng chỉ nằm trong tệp chữ, không nằm trong dòng lệnh/filtergraph', () => {
    const plan = planSlideshow(job, { outputPath: '/o/out.mp4', workDir: dir });
    const cmd = plan.args.join(' ');
    expect(cmd).not.toContain('%{pid}');
    expect(cmd).not.toContain('Giảm');
    expect(cmd).toContain('expansion=none');
    expect(plan.files).toHaveLength(1);
    expect(plan.files[0]!.content).toContain('%{pid}');
  });

  it('đường dẫn ảnh đi qua -i file:<đường dẫn> (tắt giao thức lạ như concat:/http:)', () => {
    const plan = planSlideshow(job, { outputPath: '/o/out.mp4', workDir: dir });
    const i = plan.args.indexOf('-i');
    expect(plan.args[i + 1]).toBe('file:/p/a b.jpg');
    const evil = planSlideshow(base([{ type: 'photo', imagePath: 'concat:/etc/passwd|x.jpg', durationS: 3 }]), { outputPath: '/o/out.mp4', workDir: dir });
    expect(evil.args[evil.args.indexOf('-i') + 1]).toBe('file:concat:/etc/passwd|x.jpg');
  });

  it('chỉ nhận encoder LGPL trong danh sách cho phép', () => {
    expect(() => planSlideshow(job, { outputPath: '/o/out.mp4', workDir: dir, videoCodec: 'libx264' })).toThrowError(/LGPL/);
  });

  it('bitrate bị chặn để file không vượt maxBytes (Zalo OA 50 MB)', () => {
    const long = base(Array.from({ length: 9 }, () => ({ type: 'card' as const, durationS: 10, transition: 'none' as const })), { output: { width: 1080, height: 1920, fps: 30, maxBytes: 45_000_000 } } as never);
    const plan = planSlideshow(long, { outputPath: '/o/out.mp4', workDir: dir });
    expect((plan.bitrate * plan.durationS) / 8).toBeLessThanOrEqual(45_000_000);
  });

  it('tổng thời lượng = tổng cảnh − phần chồng chuyển cảnh; khung = thời lượng × fps', () => {
    const j = base([{ type: 'card', durationS: 3 }, { type: 'card', durationS: 3, transition: 'fade', transitionS: 0.5 }, { type: 'card', durationS: 2, transition: 'none' }]);
    const plan = planSlideshow(j, { outputPath: '/o/out.mp4', workDir: dir });
    expect(plan.durationS).toBeCloseTo(7.5, 6);
    expect(plan.totalFrames).toBe(Math.round(7.5 * 25));
  });

  it('báo lỗi tiếng Việt khi lệnh quá dài thay vì làm Windows từ chối', () => {
    const texts = Array.from({ length: 4 }, (_, k) => ({ text: 'x'.repeat(100), position: (['top', 'center', 'lower_third', 'bottom'] as const)[k]! }));
    const huge = base(Array.from({ length: 16 }, (_, i) => ({ type: 'photo' as const, imagePath: `/very/long/${'d'.repeat(180)}/${i}.jpg`, durationS: 3, texts })));
    expect(() => planSlideshow(huge, { outputPath: '/o/out.mp4', workDir: dir })).toThrowError(/quá nhiều cảnh/);
  });
});

describe.skipIf(!canRender)('renderSlideshow (ffmpeg LGPL thật)', () => {
  let dir = '';
  let landscape = '';
  let portrait = '';
  let logo = '';
  let tone = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'aps-slide test:'));
    landscape = join(dir, 'ảnh 100%d ngang.jpg');
    portrait = join(dir, 'doc.jpg');
    logo = join(dir, 'logo.png');
    tone = join(dir, 'nhac.wav');
    makeImage(FF, join(dir, 'ngang.jpg'), 'testsrc2=s=1600x900');
    copyFileSync(join(dir, 'ngang.jpg'), landscape);
    makeImage(FF, portrait, 'gradients=s=900x1600:seed=3');
    makeImage(FF, logo, 'color=c=0xff0000:s=200x200');
    const r = run(FF, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', tone]);
    if (r.status !== 0) throw new Error(r.stderr);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const out = (n: string) => join(dir, `${n}.mp4`);

  it('video mp4 H.264 yuv420p, đúng kích thước, số khung, thời lượng; đường dẫn có dấu cách, %, :, tiếng Việt', async () => {
    const progress: number[] = [];
    const job = base([
      { type: 'photo', imagePath: landscape, durationS: 3, motion: 'zoom_in', texts: [{ text: 'Nhôm Kính Hoàng Gia', position: 'top', style: 'title' }] },
      { type: 'photo', imagePath: portrait, durationS: 3, fit: 'contain_blur', motion: 'pan_right', transition: 'slideleft' },
      { type: 'collage', imagePaths: [landscape, portrait], durationS: 3, transition: 'wipeleft' },
      { type: 'card', durationS: 2, backgroundColor: '#0b4f8a', texts: [{ text: 'Liên hệ: 0901\u00a0234\u00a0567', position: 'center' }] },
    ]);
    const r = await renderSlideshow(job, { ffmpegPath: FF, outputPath: out('full'), onProgress: (f) => progress.push(f) });
    const p = probe(FF, out('full'));
    expect(p).toMatchObject({ codec: 'h264', pixFmt: 'yuv420p', width: 360, height: 640, audio: false });
    expect(p.frames).toBe(r.totalFrames);
    expect(p.durationS).toBeCloseTo(r.durationS, 1);
    expect(r.durationS).toBeCloseTo(3 + 3 + 3 + 2 - 1.5, 6);
    expect(progress.length).toBeGreaterThan(0);
    expect(Math.max(...progress)).toBeGreaterThan(r.totalFrames * 0.8);
  }, 120_000);

  it('Ken Burns: khung đầu và cuối cảnh khác nhau; motion none thì giống nhau', async () => {
    const moving = base([{ type: 'photo', imagePath: landscape, durationS: 3, motion: 'zoom_in', zoom: 0.25 }]);
    const still = base([{ type: 'photo', imagePath: landscape, durationS: 3, motion: 'none' }]);
    await renderSlideshow(moving, { ffmpegPath: FF, outputPath: out('kb') });
    await renderSlideshow(still, { ffmpegPath: FF, outputPath: out('still') });
    const d = (f: string) => meanAbsDiff(frameAt(FF, f, 0.1, 360, 640), frameAt(FF, f, 2.8, 360, 640));
    expect(d(out('kb'))).toBeGreaterThan(5);
    expect(d(out('still'))).toBeLessThan(1.5);
  }, 120_000);

  it('chữ chỉ hiện trong khoảng t..tEnd (so với video không chữ) và chữ Việt có dấu được vẽ', async () => {
    const withText = base([{ type: 'card', durationS: 4, backgroundColor: '#202020', texts: [{ text: 'Ưu đãi tháng này', position: 'center', style: 'title', t: 1, tEnd: 3, anim: 'none' }] }]);
    const without = base([{ type: 'card', durationS: 4, backgroundColor: '#202020' }]);
    await renderSlideshow(withText, { ffmpegPath: FF, outputPath: out('txt') });
    await renderSlideshow(without, { ffmpegPath: FF, outputPath: out('notxt') });
    const at = (f: string, t: number) => frameAt(FF, f, t, 360, 640);
    expect(meanAbsDiff(at(out('txt'), 0.4), at(out('notxt'), 0.4))).toBeLessThan(0.05);
    expect(meanAbsDiff(at(out('txt'), 2), at(out('notxt'), 2))).toBeGreaterThan(0.5);
    expect(meanAbsDiff(at(out('txt'), 3.6), at(out('notxt'), 3.6))).toBeLessThan(0.05);
  }, 120_000);

  it('logo chỉ hiện trong khoảng thời gian chỉ định, đúng màu gốc (không méo màu)', async () => {
    const job = base([{ type: 'card', durationS: 4, backgroundColor: '#ffffff' }], { logo: { imagePath: logo, position: 'top_right', heightPct: 0.2, t: 2, tEnd: 4, anim: 'none' } });
    await renderSlideshow(job, { ffmpegPath: FF, outputPath: out('logo') });
    const spot = (t: number) => pixel(frameAt(FF, out('logo'), t, 360, 640), 360, 360 - 14 - 64, 32 + 64);
    const before = spot(1);
    const during = spot(3);
    expect(before.every((c) => c > 240)).toBe(true);
    expect(during[0]).toBeGreaterThan(200);
    expect(during[1]).toBeLessThan(60);
    expect(during[2]).toBeLessThan(60);
  }, 120_000);

  it('nhạc nền: có luồng AAC, cắt đúng thời lượng video; không nhạc thì không có luồng âm thanh', async () => {
    const job = base([{ type: 'card', durationS: 5 }], { audio: { path: tone, volume: 0.5, fadeInS: 0.5, fadeOutS: 1 } });
    await renderSlideshow(job, { ffmpegPath: FF, outputPath: out('audio') });
    const p = probe(FF, out('audio'));
    expect(p.audio).toBe(true);
    expect(p.durationS).toBeCloseTo(5, 0);
    const info = run(FF, ['-hide_banner', '-i', out('audio')]).stderr;
    expect(info).toMatch(/Audio: aac/);
  }, 120_000);

  it('ảnh có EXIF xoay (điện thoại chụp dọc): video hiển thị đúng chiều', async () => {
    const wide = join(dir, 'exif-src.jpg');
    const mk = run(FF, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xff0000:s=100x100', '-f', 'lavfi', '-i', 'color=c=0x0000ff:s=100x100', '-filter_complex', 'hstack', '-frames:v', '1', wide]);
    expect(mk.status).toBe(0);
    const src = readFileSync(wide);
    // TIFF big-endian, một mục Orientation (0x0112) = 6: hiển thị phải xoay 90° theo chiều kim đồng hồ.
    const tiff = Buffer.from('4d4d002a00000008' + '0001' + '011200030000000100060000' + '00000000', 'hex');
    const header = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
    const seg = Buffer.concat([Buffer.from([0xff, 0xe1, (header.length + 2) >> 8, (header.length + 2) & 0xff]), header]);
    const rotated = join(dir, 'exif-rot.jpg');
    writeFileSync(rotated, Buffer.concat([src.subarray(0, 2), seg, src.subarray(2)]));
    await renderSlideshow(base([{ type: 'photo', imagePath: rotated, durationS: 2, motion: 'none' }]), { ffmpegPath: FF, outputPath: out('exif') });
    const f = frameAt(FF, out('exif'), 1, 360, 640);
    const top = pixel(f, 360, 180, 100);
    const bottom = pixel(f, 360, 180, 540);
    expect(top[0]).toBeGreaterThan(180);
    expect(top[2]).toBeLessThan(80);
    expect(bottom[2]).toBeGreaterThan(180);
    expect(bottom[0]).toBeLessThan(80);
  }, 120_000);

  it('thiếu ảnh -> lỗi tiếng Việt có mã SLIDESHOW_PHOTO_MISSING, không chạy ffmpeg', async () => {
    const job = base([{ type: 'photo', imagePath: join(dir, 'khong-co.jpg'), durationS: 3 }]);
    await expect(renderSlideshow(job, { ffmpegPath: FF, outputPath: out('missing') })).rejects.toMatchObject({ code: 'SLIDESHOW_PHOTO_MISSING', message: expect.stringContaining('Không tìm thấy ảnh') });
    expect(existsSync(out('missing'))).toBe(false);
  });

  it('ảnh hỏng -> lỗi tiếng Việt SLIDESHOW_FFMPEG_FAILED kèm chi tiết kỹ thuật tách riêng', async () => {
    const bad = join(dir, 'hong.jpg');
    writeFileSync(bad, 'đây không phải ảnh');
    const err = await renderSlideshow(base([{ type: 'photo', imagePath: bad, durationS: 3 }]), { ffmpegPath: FF, outputPath: out('bad') }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('SLIDESHOW_FFMPEG_FAILED');
    expect((err as AppError).message).toMatch(/đổi ảnh khác/);
  }, 60_000);

  it('huỷ bằng AbortSignal dừng ffmpeg và báo SLIDESHOW_CANCELED', async () => {
    const scenes = Array.from({ length: 6 }, () => ({ type: 'photo' as const, imagePath: landscape, durationS: 12, transition: 'none' as const }));
    const job = base(scenes, { output: { width: 1080, height: 1920, fps: 30 } } as never);
    const ac = new AbortController();
    const p = renderSlideshow(job, { ffmpegPath: FF, outputPath: out('cancel'), signal: ac.signal, onProgress: () => ac.abort() });
    await expect(p).rejects.toMatchObject({ code: 'SLIDESHOW_CANCELED' });
  }, 60_000);

  it('dung lượng đầu ra nằm dưới trần maxBytes', async () => {
    await renderSlideshow(base([{ type: 'photo', imagePath: landscape, durationS: 6 }], { output: { width: 540, height: 960, fps: 30, maxBytes: 1_500_000 } } as never), { ffmpegPath: FF, outputPath: out('cap') });
    expect(statSync(out('cap')).size).toBeLessThan(1_500_000);
  }, 120_000);
});
