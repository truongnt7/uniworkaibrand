import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { MockProvider, type TimelineInput } from '@aps/ai';
import { WorkerJob, type RenderRequest, type InvokeReq, type JobRecord, type WorkerJobV2 } from '@aps/shared';
import { createOrchestrator, type Orchestrator } from '../src/orchestrator/orchestrator.js';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..', '..');
const fakeBlenderJs = join(here, 'fixtures', 'fake-blender.mjs');
const samples = join(repo, 'assets', 'samples');

/** Binary LGPL đã ghim (tools/ffmpeg/fetch-lgpl.mjs); không có thì bỏ qua các test mã hóa thật. */
const LGPL_FFMPEG = process.env.APS_TEST_FFMPEG_LGPL ?? '';
const hasFfmpeg = LGPL_FFMPEG !== '' && spawnSync(LGPL_FFMPEG, ['-version']).status === 0;
const FFPROBE = hasFfmpeg && existsSync(join(dirname(LGPL_FFMPEG), 'ffprobe')) ? join(dirname(LGPL_FFMPEG), 'ffprobe') : 'ffprobe';
/** Blender 4.5 thật (tải bằng `pnpm poc:render install` hoặc giải nén từ tools/runtime/manifest.json). Chạy trong VM không GPU cần Xvfb. */
const REAL_BLENDER = process.env.APS_TEST_BLENDER ?? '';
const hasBlender = REAL_BLENDER !== '' && existsSync(REAL_BLENDER);
const posix = process.platform !== 'win32';

const dirs: string[] = [];
const orchestrators: Orchestrator[] = [];
afterEach(async () => {
  for (const o of orchestrators.splice(0)) await o.shutdown();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function setup(opts: { realBlender?: boolean; useEnvProvider?: boolean; env?: NodeJS.ProcessEnv; provider?: () => MockProvider | null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aps-timeline-'));
  dirs.push(dir);
  let blender = REAL_BLENDER;
  if (!opts.realBlender) {
    blender = join(dir, 'blender');
    writeFileSync(blender, `#!/bin/sh\nexec "${process.execPath}" "${fakeBlenderJs}" "$@"\n`);
    chmodSync(blender, 0o755);
  }
  const logs: string[] = [];
  const orch = createOrchestrator(
    {
      dataDir: dir,
      workerScript: join(repo, 'blender-worker', 'worker.py'),
      manifestPath: join(dir, 'none.json'),
      productionKeysDir: null,
      release: false,
      blenderOverride: blender,
      ffmpegOverride: hasFfmpeg ? LGPL_FFMPEG : 'ffmpeg',
      env: opts.env ?? {},
      ...(opts.useEnvProvider ? {} : { directorProvider: opts.provider ?? (() => null) }),
      onLog: (_id, line) => logs.push(line),
    },
    () => undefined,
  );
  orchestrators.push(orch);
  const call = async <C extends 'jobs:createFromPrompt' | 'jobs:create'>(channel: C, req: InvokeReq<C>) =>
    (orch.handlers[channel] as (r: unknown) => Promise<unknown>)(req);
  const jobJson = (job: JobRecord): WorkerJobV2 => {
    const parsed = WorkerJob.parse(JSON.parse(readFileSync(join(dir, 'jobs', job.id, 'job.json'), 'utf8')));
    if (parsed.version !== 2) throw new Error('mong đợi job v2');
    return parsed;
  };
  return { dir, orch, logs, call, jobJson };
}

const product = { glbPath: join(samples, 'serum-bottle.glb'), label: { imagePath: join(samples, 'label.png'), mode: 'cylinder' as const, centerDeg: 0 } };

function probe(file: string): string {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,width,height,nb_frames', '-of', 'csv=p=0', file]);
  return r.stdout.toString().trim();
}

/** Vùng ảnh thô (rgb24) của một khung để so sánh điểm ảnh. */
function region(input: string, frame: number | null, box: { x: number; y: number; w: number; h: number }): Buffer {
  const pick = frame === null ? '' : `select=eq(n\\,${frame}),`;
  const args = ['-v', 'error', '-i', input, '-vf', `${pick}crop=${box.w}:${box.h}:${box.x}:${box.y}`, '-frames:v', '1', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'];
  const r = spawnSync(hasFfmpeg ? LGPL_FFMPEG : 'ffmpeg', args, { maxBuffer: 64 * 1024 * 1024 });
  return r.stdout;
}
/** Tỉ lệ điểm ảnh lệch rõ (> 50 ở ít nhất một kênh): bền hơn trung bình khi encode có nhiễu nén. */
function changedFraction(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  expect(a.length).toBeGreaterThan(0);
  let n = 0;
  for (let i = 0; i < a.length; i += 3) {
    if (Math.max(Math.abs(a[i]! - b[i]!), Math.abs(a[i + 1]! - b[i + 1]!), Math.abs(a[i + 2]! - b[i + 2]!)) > 50) n++;
  }
  return n / (a.length / 3);
}
function meanAbsDiff(a: Buffer, b: Buffer): number {
  expect(a.length).toBe(b.length);
  expect(a.length).toBeGreaterThan(0);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!);
  return sum / a.length;
}

const PROMPT = 'Video ngang 2 giây: chai xoay 360 độ, camera tiến gần rồi quay quanh 90 độ, cuối video hiện logo ở giữa';

describe.skipIf(!posix)('Đạo diễn AI -> job v2 -> render -> ffmpeg (Blender giả)', () => {
  it.skipIf(!hasFfmpeg)('prompt tiếng Việt -> timeline -> job.json v2 -> mp4 H.264, giữ nhãn và logo theo timeline', async () => {
    const { orch, call, jobJson, dir } = setup();
    const res = (await call('jobs:createFromPrompt', {
      prompt: PROMPT,
      product,
      logoPath: join(samples, 'logo.png'),
      render: { shortSide: 90, fps: 15 },
    })) as { job: JobRecord; director: { source: string; warnings: string[] } };
    expect(res.director.source).toBe('rules');
    expect((res.job.request as RenderRequest).timeline).toMatchObject({ version: 1, aspect: '16:9' });

    await orch.queue.idle();
    const done = orch.queue.get(res.job.id)!;
    expect(done).toMatchObject({ status: 'done', progress: 1, totalFrames: 30 });

    const job = jobJson(done);
    expect(job).toMatchObject({ version: 2, frames: { total: 30, fps: 15 }, render: { width: 160, height: 90 }, product: { lockLabel: true } });
    expect(job.product.label).toEqual(product.label);
    expect(job.tracks.product.rotZDeg.at(-1)!.v).toBe(360);
    expect(Math.abs(job.tracks.camera.azimuthDeg.at(-1)!.v)).toBe(90);
    expect(job.tracks.camera.distanceScale.at(-1)!.v).toBeLessThan(1);
    expect(job.overlays.logo).toHaveLength(1);
    expect(JSON.stringify(job)).not.toMatch(/bpy|import /);

    expect(probe(done.outputPath!)).toBe('h264,160,90,yuv420p,30');
    expect(statSync(done.outputPath!).size).toBeGreaterThan(500);

    // Logo chỉ hiện ở cuối video: vùng giữa khung khớp khung Blender ở đầu video, lệch rõ ở cuối.
    const frames = join(dir, 'jobs', done.id, 'frames');
    const logo = job.overlays.logo[0]!;
    const box = { x: 66, y: 38, w: 28, h: 14 };
    const shownIdx = Math.round((logo.tEnd - 0.4) * 15); // sau fade-in, trước fade-out (chỉ số khung 0-based)
    const pad = (n: number) => String(n + 1).padStart(6, '0');
    const early = changedFraction(region(done.outputPath!, 2, box), region(join(frames, `frame_${pad(2)}.png`), null, box));
    const late = changedFraction(region(done.outputPath!, shownIdx, box), region(join(frames, `frame_${pad(shownIdx)}.png`), null, box));
    expect(early).toBeLessThan(0.01);
    expect(late).toBeGreaterThan(0.03);
  });

  it('LLM trả mã bpy -> bị từ chối, về rule-based, job.json không chứa mã', async () => {
    const provider = new MockProvider(["import bpy\nbpy.ops.wm.quit_blender()", '{"script": "import bpy"}']);
    const { orch, call, jobJson } = setup({ provider: () => provider });
    const res = (await call('jobs:createFromPrompt', { prompt: PROMPT, product, render: { shortSide: 90, fps: 15 } })) as {
      job: JobRecord;
      director: { source: string; fallbackReason?: string };
    };
    expect(res.director.source).toBe('rules');
    expect(res.director.fallbackReason).toBeTruthy();
    await orch.queue.idle();
    expect(JSON.stringify(jobJson(orch.queue.get(res.job.id)!))).not.toMatch(/bpy|quit_blender/);
  });

  it('LLM trả timeline hợp lệ -> dùng nguyên timeline đó (nhiều đoạn camera, ánh sáng theo mẫu cảnh)', async () => {
    const timeline: TimelineInput = {
      version: 1,
      aspect: '16:9',
      duration_s: 2,
      fps: 15,
      tracks: {
        product: [{ t: 0, t_end: 2, motion: 'spin360', turns: 1, speed: 'normal', ease: 'smooth' }],
        camera: [
          { t: 0, t_end: 1, move: 'dolly_in', from: 'eye_level', amount: 0.25, ease: 'smooth' },
          { t: 1, t_end: 2, move: 'orbit', from: 'high', degrees: 45, ease: 'smooth' },
        ],
        logo: [],
      },
      scene: { template_id: 'luxury-dark', hide: ['platform'], palette: 'brand' },
      lock_label: true,
    };
    const provider = new MockProvider([JSON.stringify(timeline)]);
    const { orch, call, jobJson } = setup({ provider: () => provider });
    const res = (await call('jobs:createFromPrompt', { prompt: 'bất kỳ', product, render: { shortSide: 90 } })) as {
      job: JobRecord;
      director: { source: string };
    };
    expect(res.director.source).toBe('llm');
    await orch.queue.idle();
    const job = jobJson(orch.queue.get(res.job.id)!);
    expect(job.scene).toMatchObject({ template: 'luxury-dark', hide: ['platform'] });
    expect(job.tracks.camera.azimuthDeg.at(-1)!.v).toBe(45);
    expect(job.tracks.light.keyAzimuthDeg.length).toBeGreaterThan(1);
  });

  it('khóa LLM chỉ dùng ở orchestrator: không xuất hiện trong phản hồi, job.json hay nhật ký, kể cả khi gọi lỗi', async () => {
    const secret = 'sk-test-SECRET-1234567890';
    const { orch, call, jobJson, logs } = setup({
      useEnvProvider: true,
      env: { APS_AI_BASE_URL: 'http://127.0.0.1:9', APS_AI_API_KEY: secret, APS_AI_MODEL: 'm', APS_AI_TIMEOUT_MS: '1500' },
    });
    const res = (await call('jobs:createFromPrompt', { prompt: PROMPT, product, render: { shortSide: 90, fps: 15 } })) as {
      job: JobRecord;
      director: { source: string; fallbackReason?: string };
    };
    expect(res.director.source).toBe('rules');
    expect(res.director.fallbackReason).toBeTruthy();
    await orch.queue.idle();
    const blob = JSON.stringify([res, jobJson(orch.queue.get(res.job.id)!), logs, orch.queue.list()]);
    expect(blob).not.toContain(secret);
  });

  it('jobs:create với timeline sai bị từ chối ngay (INVALID_TIMELINE), không vào hàng đợi', async () => {
    const { orch, call } = setup();
    const bad = { version: 1 as const, aspect: '16:9', duration_s: 2, fps: 15, tracks: { product: [], camera: [], logo: [] }, script: 'import bpy' };
    await expect(call('jobs:create', { product, output: { kind: 'video', durationS: 2, fps: 15 }, timeline: bad })).rejects.toMatchObject({ code: 'INVALID_TIMELINE' });
    const okTimeline = { version: 1 as const, aspect: '16:9', duration_s: 2, fps: 15, tracks: { product: [], camera: [], logo: [] } };
    await expect(call('jobs:create', { product, output: { kind: 'video', durationS: 5, fps: 15 }, timeline: okTimeline })).rejects.toMatchObject({ code: 'INVALID_TIMELINE' });
    await expect(call('jobs:create', { product, output: { kind: 'image' }, timeline: okTimeline })).rejects.toMatchObject({ code: 'INVALID_TIMELINE' });
    expect(orch.queue.list()).toHaveLength(0);
  });

  it('thiếu ảnh logo -> LOGO_NOT_FOUND trước khi chạy Blender', async () => {
    const { orch, call } = setup();
    const res = (await call('jobs:createFromPrompt', { prompt: PROMPT, product, logoPath: '/nope/logo.png', render: { shortSide: 90, fps: 15 } })) as { job: JobRecord };
    await orch.queue.idle();
    expect(orch.queue.get(res.job.id)).toMatchObject({ status: 'failed', errorCode: 'LOGO_NOT_FOUND' });
  });
});

/**
 * Chạy Blender 4.5 thật (EEVEE) qua toàn bộ đường: prompt -> Đạo diễn -> job v2 -> worker -> ffmpeg LGPL.
 * Bật bằng APS_TEST_BLENDER=<đường dẫn blender> và APS_TEST_FFMPEG_LGPL; trong VM không GPU: `xvfb-run -a pnpm --filter @aps/desktop test`.
 */
describe.skipIf(!posix || !hasBlender || !hasFfmpeg)('E2E Blender thật + EEVEE (video 2 giây, 256x144)', () => {
  it('prompt -> mp4: nhãn còn nguyên bằng decal, camera/sản phẩm chuyển động, chữ hiện đúng khoảng thời gian', async () => {
    const { orch, call, jobJson, dir, logs } = setup({ realBlender: true });
    const res = (await call('jobs:createFromPrompt', {
      prompt: 'Video ngang 2 giây, chai xoay một vòng, camera tiến gần rồi quay quanh 60 độ, cuối video hiện logo ở giữa',
      product,
      logoPath: join(samples, 'logo.png'),
      render: { shortSide: 144, fps: 15, samples: 4 },
      extras: { text: [{ t: 0.2, tEnd: 1.2, text: 'Dịu nhẹ cho làn da', position: 'top_center', anim: 'none', sizePct: 12, color: '#ff2020' }] },
    })) as { job: JobRecord };

    const deadline = Date.now() + 9 * 60_000;
    while (Date.now() < deadline && !['done', 'failed', 'needs_attention', 'canceled'].includes(orch.queue.get(res.job.id)!.status)) {
      await new Promise((r) => setTimeout(r, 500));
    }
    const done = orch.queue.get(res.job.id)!;
    expect(done, `${done.errorCode}: ${done.errorMessage}\n${logs.slice(-15).join('\n')}`).toMatchObject({ status: 'done', totalFrames: 30 });

    expect(probe(done.outputPath!)).toBe('h264,256,144,yuv420p,30');
    const job = jobJson(done);
    const frames = join(dir, 'jobs', done.id, 'frames');
    expect(readdirSync(frames).filter((f) => f.endsWith('.png'))).toHaveLength(30);
    expect(logs.join('\n')).toMatch(/decal nhãn \(cylinder\)/);
    expect(logs.join('\n')).toMatch(/giữ nhãn \(decal\)/);
    expect(job.product.lockLabel).toBe(true);

    // Chữ đỏ chỉ có trong khung nằm trong [0,2; 1,2] giây (khung 5 ~ 0,27 s), không có ở khung 25 (1,6 s).
    const top = { x: 60, y: 6, w: 136, h: 26 };
    const redness = (file: string) => {
      const px = region(file, null, top);
      let n = 0;
      for (let i = 0; i < px.length; i += 3) if (px[i]! > 180 && px[i + 1]! < 90 && px[i + 2]! < 90) n++;
      return n;
    };
    expect(redness(join(frames, 'frame_000005.png'))).toBeGreaterThan(20);
    expect(redness(join(frames, 'frame_000025.png'))).toBe(0);

    // Sản phẩm xoay + camera đổi: khung đầu/giữa/cuối khác nhau rõ rệt.
    const mid = { x: 78, y: 20, w: 100, h: 110 };
    const a = region(join(frames, 'frame_000001.png'), null, mid);
    const b = region(join(frames, 'frame_000015.png'), null, mid);
    const c = region(join(frames, 'frame_000030.png'), null, mid);
    expect(meanAbsDiff(a, b)).toBeGreaterThan(2);
    expect(meanAbsDiff(b, c)).toBeGreaterThan(2);
  }, 700_000);
});
