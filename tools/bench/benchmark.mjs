#!/usr/bin/env node
/**
 * Benchmark + phân hạng máy (P0-13): cảnh chuẩn (assets/samples/serum-bottle.glb + label.png), đo thời gian khởi động Blender,
 * giây/khung của EEVEE và Cycles, RAM đỉnh của tiến trình Blender, thiết bị render thực tế, và độ chính xác của ước lượng thời gian.
 *
 *   node tools/bench/benchmark.mjs --blender <blender> [--out bench.json] [--width 960 --height 540] [--frames 6]
 *
 * Phân hạng (ngưỡng ghi trong kết quả): A = EEVEE <= 1.5 s/khung ở 960x540; B = <= 6 s; C = chậm hơn hoặc EEVEE không chạy được.
 * Mục tiêu chưa kiểm chứng ngoài Linux/llvmpipe: kết quả hiện có chỉ là MỘT máy; cần chạy trên 5-8 máy thật theo kế hoạch.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const { values } = parseArgs({ options: { blender: { type: 'string' }, out: { type: 'string' }, width: { type: 'string', default: '960' }, height: { type: 'string', default: '540' }, frames: { type: 'string', default: '6' }, samples: { type: 'string', default: '16' } } });
if (!values.blender) throw new Error('thiếu --blender');
const blender = resolve(values.blender);
const TIERS = { A: 1.5, B: 6 };

function rssKb(pid) {
  try {
    const m = /VmHWM:\s+(\d+)/.exec(readFileSync(`/proc/${pid}/status`, 'utf8'));
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

async function runJob(engine, frames, { total = frames } = {}) {
  const dir = mkdtempSync(join(os.tmpdir(), 'aps-bench-'));
  const framesDir = join(dir, 'frames');
  mkdirSync(framesDir, { recursive: true });
  const job = {
    version: 1, mode: 'render', jobId: 'bench',
    product: { glbPath: join(root, 'assets/samples/serum-bottle.glb'), label: { imagePath: join(root, 'assets/samples/label.png'), mode: 'cylinder', widthMm: 94, heightMm: 60, bottomMm: 20, centerDeg: 0 } },
    scene: { template: 'studio-soft', backgroundColor: '#e9e4dc', shadow: 0.6 },
    motion: 'spin360',
    render: { engine, samples: Number(values.samples), width: Number(values.width), height: Number(values.height), device: 'auto' },
    frames: { total, angleStartDeg: 0, angleSpanDeg: 360 },
    paths: { framesDir, pattern: 'frame_%06d.png' },
  };
  const jobPath = join(dir, 'job.json');
  writeFileSync(jobPath, JSON.stringify(job));
  const t0 = Date.now();
  const child = spawn(blender, ['-b', '-noaudio', '--factory-startup', '--python-exit-code', '1', '--python', join(root, 'blender-worker/worker.py'), '--', jobPath], { stdio: ['ignore', 'pipe', 'pipe'] });
  let peak = 0;
  const poll = setInterval(() => (peak = Math.max(peak, rssKb(child.pid))), 200);
  let first = null;
  const frameMs = [];
  let device = null;
  let err = '';
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d.toString('utf8');
    for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (!line.startsWith('{')) continue;
      try {
        const ev = JSON.parse(line);
        if (first === null && ev.type === 'progress') first = Date.now() - t0;
        if (ev.type === 'frame_done' && !ev.skipped) frameMs.push(ev.ms);
        if (ev.type === 'device') device = ev;
        if (ev.type === 'error') err = ev.message;
      } catch { /* bỏ dòng không phải JSON */ }
    }
  });
  child.stderr.on('data', (d) => (err ||= d.toString('utf8').slice(0, 200)));
  const code = await new Promise((r) => child.on('close', r));
  clearInterval(poll);
  const wall = Date.now() - t0;
  rmSync(dir, { recursive: true, force: true });
  return { ok: code === 0, error: code === 0 ? null : err, startupMs: first, wallMs: wall, frameMs, device, peakRssMb: Math.round(peak / 1024) };
}

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? null;
const result = { machine: { platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model, cores: os.cpus().length, memGb: Math.round(os.totalmem() / 2 ** 30) }, settings: values, tiers: TIERS, engines: {} };
result.machine.blender = spawnSync(blender, ['--version'], { encoding: 'utf8' }).stdout.split('\n')[0];

for (const engine of ['eevee', 'cycles']) {
  const r = await runJob(engine, Number(values.frames));
  const warm = r.frameMs.slice(1);
  result.engines[engine] = { ...r, secPerFrameMedian: median(r.frameMs) === null ? null : median(r.frameMs) / 1000, secPerFrameWarm: warm.length ? median(warm) / 1000 : null };
  console.log(engine, JSON.stringify({ ok: r.ok, startupMs: r.startupMs, sPerFrame: result.engines[engine].secPerFrameMedian, peakRssMb: r.peakRssMb, device: r.device?.name ?? r.device?.device }));
}

const ev = result.engines.eevee;
result.tier = !ev.ok || ev.secPerFrameMedian === null ? 'C' : ev.secPerFrameMedian <= TIERS.A ? 'A' : ev.secPerFrameMedian <= TIERS.B ? 'B' : 'C';

// Ước lượng: đo 2 khung đầu của job dài hơn rồi ngoại suy; so với thời gian thật của chính job đó.
const N = 12;
const est = await runJob('eevee', N);
if (est.ok && est.frameMs.length === N) {
  const startup = est.startupMs ?? 0;
  const perFrame = (est.frameMs[0] + est.frameMs[1] + est.frameMs[2]) / 3;
  const predicted = startup + perFrame * N;
  result.estimate = { frames: N, predictedMs: Math.round(predicted), actualMs: est.wallMs, errorPct: Math.round((Math.abs(predicted - est.wallMs) / est.wallMs) * 1000) / 10, targetPct: 30 };
}
console.log('hạng', result.tier, 'ước lượng', JSON.stringify(result.estimate));
if (values.out) writeFileSync(resolve(values.out), JSON.stringify(result, null, 1));
