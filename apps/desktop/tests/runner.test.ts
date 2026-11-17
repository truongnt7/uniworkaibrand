import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { RenderRequestInput } from '@aps/shared';
import { openDb } from '../src/orchestrator/db.js';
import { JobStore } from '../src/orchestrator/jobStore.js';
import { JobQueue } from '../src/orchestrator/queue.js';
import { BlenderRunner } from '../src/orchestrator/blenderRunner.js';

const here = dirname(fileURLToPath(import.meta.url));
const fakeBlenderJs = join(here, 'fixtures', 'fake-blender.mjs');
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const posix = process.platform !== 'win32';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function env(extra: Record<string, string> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aps-runner-'));
  dirs.push(dir);
  const bin = join(dir, 'blender');
  const envLines = Object.entries(extra).map(([k, v]) => `export ${k}=${JSON.stringify(v)}`).join('\n');
  writeFileSync(bin, `#!/bin/sh\n${envLines}\nexec "${process.execPath}" "${fakeBlenderJs}" "$@"\n`);
  chmodSync(bin, 0o755);
  const glb = join(dir, 'p.glb');
  writeFileSync(glb, 'glb');
  const db = openDb(':memory:');
  const store = new JobStore(db);
  const logs: string[] = [];
  const runner = new BlenderRunner({
    jobsDir: join(dir, 'jobs'),
    workerScript: '/unused/worker.py',
    getBlenderBinary: async () => bin,
    ffmpegPath: 'ffmpeg',
    onLog: (_id, l) => logs.push(l),
  });
  const queue = new JobQueue({ store, runner, emitThrottleMs: 0 });
  const req = (output: Record<string, unknown>): RenderRequestInput => ({
    product: { glbPath: glb },
    output: { width: 128, height: 72, fps: 10, durationS: 1, ...output } as RenderRequestInput['output'],
  });
  return { dir, queue, req, store, logs };
}

describe.skipIf(!posix)('BlenderRunner (Blender giả + ffmpeg thật)', () => {
  it.skipIf(!hasFfmpeg)('video: chạy worker, ghép mp4 H.264 yuv420p', async () => {
    const { queue, req } = env();
    const job = queue.enqueue(req({ kind: 'video' }));
    await queue.idle();
    const done = queue.get(job.id)!;
    expect(done).toMatchObject({ status: 'done', progress: 1, deviceInfo: 'eevee: FAKE' });
    expect(statSync(done.outputPath!).size).toBeGreaterThan(500);
    const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,pix_fmt,nb_frames', '-of', 'csv=p=0', done.outputPath!]);
    expect(probe.stdout.toString().trim()).toBe('h264,yuv420p,10');
  });

  it('ảnh: sao chép khung duy nhất thành output.png', async () => {
    const { queue, req } = env();
    const job = queue.enqueue(req({ kind: 'image' }));
    await queue.idle();
    const done = queue.get(job.id)!;
    expect(done.status).toBe('done');
    expect(done.outputPath).toMatch(/output\.png$/);
    expect(existsSync(done.outputPath!)).toBe(true);
  });

  it('lỗi có cấu trúc từ worker được giữ nguyên mã (GLB_NOT_FOUND)', async () => {
    const { queue, req } = env({ FAKE_ERROR: 'GLB_NOT_FOUND' });
    const job = queue.enqueue(req({ kind: 'image' }));
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'GLB_NOT_FOUND' });
  });

  it('Blender chết đột ngột (không có sự kiện error) -> WORKER_EXIT', async () => {
    const { queue, req } = env({ FAKE_CRASH_AT: '3' });
    const job = queue.enqueue(req({ kind: 'video' }));
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'WORKER_EXIT' });
  });

  it('file .glb không tồn tại -> GLB_NOT_FOUND trước khi spawn Blender', async () => {
    const { queue } = env();
    const job = queue.enqueue({ product: { glbPath: '/nope/missing.glb' }, output: { kind: 'image' } });
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'GLB_NOT_FOUND' });
  });

  it('resume sau khi crash: retry chỉ render các khung còn thiếu và bỏ khung .part dở dang', async () => {
    const { queue, req, dir } = env({ FAKE_CRASH_AT: '6' });
    const job = queue.enqueue(req({ kind: 'video' }));
    await queue.idle();
    expect(queue.get(job.id)!.status).toBe('failed');
    const frames = join(dir, 'jobs', job.id, 'frames');
    const pngs = () => readdirSync(frames).filter((f) => f.endsWith('.png'));
    expect(pngs()).toHaveLength(5);
    const firstFrameMtime = statSync(join(frames, 'frame_000001.png')).mtimeMs;

    writeFileSync(join(frames, 'frame_000006.png.part'), 'nửa chừng');
    writeFileSync(join(dir, 'blender'), `#!/bin/sh\nexec "${process.execPath}" "${fakeBlenderJs}" "$@"\n`);
    expect(queue.retry(job.id)).toBe(true);
    await queue.idle();

    const done = queue.get(job.id)!;
    expect(done).toMatchObject({ status: 'done', attempts: 2 });
    expect(pngs()).toHaveLength(10);
    expect(readdirSync(frames).some((f) => f.endsWith('.part'))).toBe(false);
    expect(statSync(join(frames, 'frame_000001.png')).mtimeMs).toBe(firstFrameMtime);
  });

  it('hủy job đang render dừng cả tiến trình Blender trong <= 3 giây', async () => {
    const { queue, req } = env({ FAKE_DELAY_MS: '400' });
    const job = queue.enqueue(req({ kind: 'video', durationS: 3 }));
    for (let i = 0; i < 100 && queue.get(job.id)!.frame < 2; i++) await new Promise((r) => setTimeout(r, 50));
    expect(queue.get(job.id)!.status).toBe('rendering');
    const t0 = Date.now();
    await queue.cancel(job.id);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(queue.get(job.id)).toMatchObject({ status: 'canceled' });
    await new Promise((r) => setTimeout(r, 600));
    const ps = spawnSync('pgrep', ['-f', 'fake-blender.mjs']);
    expect(ps.stdout.toString().trim()).toBe('');
  });
});
