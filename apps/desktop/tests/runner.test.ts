import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
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
/** Binary LGPL đã ghim trong manifest (tải bằng tools/ffmpeg/fetch-lgpl.mjs); không có thì bỏ qua các test mã hóa thật. */
const LGPL_FFMPEG = process.env.APS_TEST_FFMPEG_LGPL ?? '';
const hasFfmpeg = LGPL_FFMPEG !== '' && spawnSync(LGPL_FFMPEG, ['-version']).status === 0;
const systemFfmpegIsGpl = /--enable-gpl/.test(spawnSync('ffmpeg', ['-version']).stdout?.toString() ?? '');
const posix = process.platform !== 'win32';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function env(extra: Record<string, string> = {}, ffmpegBin = LGPL_FFMPEG || 'ffmpeg') {
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
    getFfmpegPath: async () => ffmpegBin,
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
    expect(queue.get(job.id)).toMatchObject({ status: 'needs_attention', errorCode: 'WORKER_EXIT', failures: 3, attempts: 3 });
  });

  it('file .glb không tồn tại -> GLB_NOT_FOUND trước khi spawn Blender', async () => {
    const { queue } = env();
    const job = queue.enqueue({ product: { glbPath: '/nope/missing.glb' }, output: { kind: 'image' } });
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'GLB_NOT_FOUND' });
  });

  it.skipIf(!hasFfmpeg)('resume sau khi crash: retry chỉ render các khung còn thiếu và bỏ khung .part dở dang', async () => {
    const { queue, req, dir } = env({ FAKE_CRASH_AT: '6' });
    const job = queue.enqueue(req({ kind: 'video' }));
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'needs_attention', failures: 3 });
    const frames = join(dir, 'jobs', job.id, 'frames');
    const pngs = () => readdirSync(frames).filter((f) => f.endsWith('.png'));
    expect(pngs()).toHaveLength(5);
    const firstFrameMtime = statSync(join(frames, 'frame_000001.png')).mtimeMs;

    writeFileSync(join(frames, 'frame_000006.png.part'), 'nửa chừng');
    writeFileSync(join(dir, 'blender'), `#!/bin/sh\nexec "${process.execPath}" "${fakeBlenderJs}" "$@"\n`);
    expect(queue.retry(job.id)).toBe(true);
    await queue.idle();

    const done = queue.get(job.id)!;
    expect(done).toMatchObject({ status: 'done', attempts: 4, failures: 0 });
    expect(pngs()).toHaveLength(10);
    expect(readdirSync(frames).some((f) => f.endsWith('.part'))).toBe(false);
    expect(statSync(join(frames, 'frame_000001.png')).mtimeMs).toBe(firstFrameMtime);
  });

  it('ffmpeg bật --enable-gpl bị từ chối trước khi mã hóa (FFMPEG_LICENSE_VIOLATION, không thử lại)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aps-fakeff-'));
    dirs.push(dir);
    const fake = join(dir, 'ffmpeg');
    writeFileSync(
      fake,
      `#!/bin/sh\ncase "$1$2" in\n*-version*) echo "ffmpeg version 7.0 fake"; echo "configuration: --enable-gpl --enable-libx264";;\n*-buildconf*) echo "--enable-gpl";;\n*-encoders*) echo " V....D libx264  x264";;\nesac\nexit 0\n`,
    );
    chmodSync(fake, 0o755);
    const { queue, req } = env({}, fake);
    const job = queue.enqueue(req({ kind: 'video' }));
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'FFMPEG_LICENSE_VIOLATION', failures: 1 });
  });

  it.skipIf(!systemFfmpegIsGpl)('ffmpeg hệ thống (GPL) không bao giờ được dùng để render', async () => {
    const { queue, req } = env({}, 'ffmpeg');
    const job = queue.enqueue(req({ kind: 'video' }));
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'FFMPEG_LICENSE_VIOLATION' });
  });

  it('reclaim: giết Blender mồ côi theo PID file sau khi app bị kill, bỏ qua PID không phải Blender', async () => {
    const { queue, req, dir, store } = env();
    const job = store.insert(
      (await import('@aps/shared')).RenderRequest.parse(req({ kind: 'image' })),
    );
    const jobDir = join(dir, 'jobs', job.id);
    mkdirSync(jobDir, { recursive: true });

    const fakeBlender = join(dir, 'blender-orphan.sh');
    writeFileSync(fakeBlender, '#!/bin/sh\nsleep 30\n');
    chmodSync(fakeBlender, 0o755);
    const orphan = spawn(fakeBlender, [], { detached: true, stdio: 'ignore' });
    const unrelated = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 200));
    const alive = (pid: number) => {
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
    };

    writeFileSync(join(jobDir, 'blender.pid'), String(unrelated.pid));
    const runner = new BlenderRunner({ jobsDir: join(dir, 'jobs'), workerScript: 'x', getBlenderBinary: async () => 'x', getFfmpegPath: async () => 'ffmpeg' });
    await runner.reclaim(job);
    expect(alive(unrelated.pid!)).toBe(true);
    expect(existsSync(join(jobDir, 'blender.pid'))).toBe(false);

    writeFileSync(join(jobDir, 'blender.pid'), String(orphan.pid));
    await runner.reclaim(job);
    await new Promise((r) => setTimeout(r, 300));
    expect(spawnSync('ps', ['-o', 'stat=', '-p', String(orphan.pid)]).stdout.toString().trim()).toMatch(/^(Z|)$/);
    process.kill(-unrelated.pid!, 'SIGKILL');
    void queue;
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
