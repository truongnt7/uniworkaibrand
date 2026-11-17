/**
 * CLI kiểm chứng PoC không cần giao diện: dùng đúng orchestrator của app (hàng đợi SQLite, runtime manager, worker).
 *
 *   pnpm dev:keys                                # (một lần) tạo khóa ký DEV + ký manifest vào .dev-keys/
 *   pnpm poc:render install                      # tải + kiểm sha256 + giải nén + smoke test Blender 4.5 LTS + ffmpeg LGPL
 *   pnpm poc:render import <file.apspack>        # nhập gói runtime offline
 *   pnpm poc:render prompt "Xoay chai chậm, camera tiến gần, cuối video hiện logo" --glb ... --label ... --logo ... --width 1280
 *                                                # Đạo diễn AI (APS_AI_* nếu có, nếu không thì rule-based offline) -> timeline -> job v2 -> mp4
 *   pnpm poc:render render --glb assets/samples/serum-bottle.glb --label assets/samples/label.png --kind video
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { RenderRequestInput } from '@aps/shared';
import { formatBytes } from '@aps/i18n';
import { createOrchestrator } from '../src/orchestrator/orchestrator.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const abs = (p: string) => resolve(invokedFrom, p);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    data: { type: 'string', default: join(repoRoot, '.poc-data') },
    blender: { type: 'string' },
    ffmpeg: { type: 'string' },
    glb: { type: 'string', default: join(repoRoot, 'assets/samples/serum-bottle.glb') },
    label: { type: 'string' },
    logo: { type: 'string' },
    kind: { type: 'string', default: 'video' },
    motion: { type: 'string', default: 'orbit' },
    engine: { type: 'string', default: 'eevee' },
    samples: { type: 'string', default: '32' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '720' },
    fps: { type: 'string', default: '30' },
    duration: { type: 'string', default: '5' },
    device: { type: 'string', default: 'auto' },
    'size-height': { type: 'string' },
    'label-width': { type: 'string' },
    'label-height': { type: 'string' },
    'label-bottom': { type: 'string' },
    'label-mode': { type: 'string', default: 'cylinder' },
    background: { type: 'string', default: '#e9e4dc' },
    out: { type: 'string' },
  },
});

const command = positionals[0] ?? 'render';

const orch = createOrchestrator(
  {
    dataDir: abs(values.data as string),
    workerScript: join(repoRoot, 'blender-worker', 'worker.py'),
    manifestPath: process.env.APS_MANIFEST_PATH ?? join(repoRoot, '.dev-keys', 'runtime-manifest.signed.json'),
    productionKeysDir: join(here, '..', 'resources', 'keys', 'production'),
    release: false,
    ffmpegOverride: values.ffmpeg ? abs(values.ffmpeg as string) : (process.env.APS_FFMPEG ?? null),
    env: { ...process.env, APS_DEV_TRUST_KEY_FILE: process.env.APS_DEV_TRUST_KEY_FILE ?? join(repoRoot, '.dev-keys', 'dev-1.pub.pem') },
    blenderOverride: values.blender ? abs(values.blender) : (process.env.APS_BLENDER_BIN ?? null),
    onLog: (_id, line) => {
      if (process.env.APS_VERBOSE) console.log(`  [blender] ${line}`);
    },
  },
  (channel, payload) => {
    if (channel === 'runtime:progress') {
      const p = payload as import('@aps/shared').RuntimeProgress;
      const pct = p.totalBytes ? ` ${((p.receivedBytes / p.totalBytes) * 100).toFixed(1)}% (${formatBytes(p.receivedBytes)}/${formatBytes(p.totalBytes)}, ${formatBytes(p.bytesPerSecond)}/s)` : '';
      const retry = p.phase === 'retrying' ? ` lần ${p.attempt}/${p.maxAttempts}: ${p.errorCode} ${p.message ?? ''}` : '';
      process.stdout.write(`\r[runtime] ${p.phase}${pct}${retry}      ${p.phase === 'downloading' ? '' : '\n'}`);
    } else if (channel === 'jobs:changed') {
      const j = payload as import('@aps/shared').JobRecord;
      process.stdout.write(
        `\r[job ${j.id.slice(0, 8)}] ${j.status.padEnd(10)} ${j.frame}/${j.totalFrames} ${(j.progress * 100).toFixed(0)}%` +
          `${j.estimateS != null ? ` ~${j.estimateS}s còn lại` : ''}${j.deviceInfo ? ` | ${j.deviceInfo}` : ''}${j.errorCode ? ` | LỖI ${j.errorCode}: ${j.errorMessage}` : ''}      `,
      );
      if (['done', 'failed', 'canceled'].includes(j.status)) process.stdout.write('\n');
    }
  },
);

async function main() {
  if (command === 'install') {
    const st = await orch.runtime.install();
    console.log('\nRuntime:', st);
    return;
  }
  if (command === 'import') {
    const file = positionals[1];
    if (!file) throw new Error('Dùng: poc-cli import <file.apspack | blender-archive>');
    console.log('\nRuntime:', await orch.runtime.importFromFile(abs(file)));
    return;
  }
  if (command === 'status') {
    console.log(await orch.runtime.status());
    return;
  }
  if (command === 'prompt') {
    const prompt = positionals.slice(1).join(' ');
    if (!prompt) throw new Error('Dùng: poc-cli prompt "<mô tả video>" [--glb ... --label ... --logo ...]');
    const label = values.label
      ? {
          label: {
            imagePath: abs(values.label),
            mode: values['label-mode'] as 'cylinder' | 'flat',
            centerDeg: 0,
            ...(values['label-width'] ? { widthMm: Number(values['label-width']) } : {}),
            ...(values['label-height'] ? { heightMm: Number(values['label-height']) } : {}),
            ...(values['label-bottom'] ? { bottomMm: Number(values['label-bottom']) } : {}),
          },
        }
      : {};
    const res = await orch.handlers['jobs:createFromPrompt']!({
      prompt,
      target: 'local',
      name: 'poc-prompt',
      product: {
        glbPath: abs(values.glb as string),
        ...(values['size-height'] ? { sizeMm: { width: 60, depth: 60, height: Number(values['size-height']) } } : {}),
        ...label,
      },
      ...(values.logo ? { logoPath: abs(values.logo) } : {}),
      render: {
        engine: values.engine as 'eevee' | 'cycles',
        samples: Number(values.samples),
        device: values.device as 'auto' | 'cpu',
        shortSide: Math.min(Number(values.width), Number(values.height)),
        fps: Number(values.fps),
      },
    });
    console.log(`Đạo diễn: ${res.director.source}${res.director.fallbackReason ? ` (dự phòng: ${res.director.fallbackReason})` : ''}`);
    for (const w of res.director.warnings) console.log(`  cảnh báo: ${w}`);
    await orch.queue.idle();
    finish(res.job.id);
    return;
  }
  const num = (s: string | undefined) => (s === undefined ? undefined : Number(s));
  const request: RenderRequestInput = {
    name: `poc-${values.kind}`,
    product: {
      glbPath: abs(values.glb as string),
      ...(values['size-height'] ? { sizeMm: { width: 60, depth: 60, height: Number(values['size-height']) } } : {}),
      ...(values.label
        ? {
            label: {
              imagePath: abs(values.label),
              mode: values['label-mode'] as 'cylinder' | 'flat',
              widthMm: num(values['label-width']),
              heightMm: num(values['label-height']),
              bottomMm: num(values['label-bottom']),
            },
          }
        : {}),
    },
    scene: { backgroundColor: values.background as string },
    output: {
      kind: values.kind as 'image' | 'video',
      motion: values.motion as 'orbit' | 'spin360',
      engine: values.engine as 'eevee' | 'cycles',
      samples: Number(values.samples),
      width: Number(values.width),
      height: Number(values.height),
      fps: Number(values.fps),
      durationS: Number(values.duration),
      device: values.device as 'auto' | 'cpu',
      ...(values.logo ? { logoPath: abs(values.logo) } : {}),
    },
  };
  const job = orch.queue.enqueue(request);
  await orch.queue.idle();
  finish(job.id);
}

function finish(jobId: string): void {
  const done = orch.queue.get(jobId);
  if (!done || done.status !== 'done') {
    console.error('Job không thành công:', done?.status, done?.errorCode, done?.errorMessage);
    process.exitCode = 1;
    return;
  }
  console.log('Kết quả:', done.outputPath);
  if (values.out && done.outputPath) {
    mkdirSync(dirname(abs(values.out)), { recursive: true });
    copyFileSync(done.outputPath, abs(values.out));
    console.log('Đã sao chép tới', abs(values.out));
  }
}

main()
  .catch((err) => {
    console.error('\nLỗi:', err instanceof Error ? `${(err as { code?: string }).code ?? ''} ${err.message}` : err);
    process.exitCode = 1;
  })
  .finally(() => orch.close());
