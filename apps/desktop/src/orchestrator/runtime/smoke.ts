import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppError } from '@aps/shared';
import { JsonLinesParser, blenderArgs, compileSmokeJob } from '@aps/render-core';
import { runProcess } from '../process.js';

export interface SmokeOptions {
  binary: string;
  expectedVersion: string;
  workerScript: string;
  workDir: string;
  signal?: AbortSignal;
}

/** `blender -b --version` rồi render 1 khung nhỏ qua chính worker; lỗi bất kỳ -> SMOKE_TEST_FAILED. */
export async function runSmokeTest(opts: SmokeOptions): Promise<void> {
  const fail = (msg: string, extra?: Record<string, unknown>) => new AppError('SMOKE_TEST_FAILED', msg, extra);

  let versionOut = '';
  const v = await runProcess(opts.binary, ['-b', '--version'], {
    signal: opts.signal,
    onStdoutChunk: (c) => (versionOut += c.toString('utf8')),
  }).catch((e: NodeJS.ErrnoException) => {
    throw fail(`không chạy được Blender: ${e.message}`);
  });
  if (v.aborted) throw new AppError('CANCELED', 'canceled');
  if (v.code !== 0) throw fail(`blender --version thoát với mã ${v.code}`, { stderr: v.stderrTail });
  if (!versionOut.includes(`Blender ${opts.expectedVersion}`)) {
    throw fail(`phiên bản không khớp manifest (cần ${opts.expectedVersion}): ${versionOut.split('\n')[0]}`);
  }

  const dir = join(opts.workDir, 'smoke');
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const jobJson = join(dir, 'job.json');
  await writeFile(jobJson, JSON.stringify(compileSmokeJob('smoke', join(dir, 'frames'))));
  const parser = new JsonLinesParser();
  let sawDone = false;
  let workerError: string | null = null;
  const handle = (l: ReturnType<JsonLinesParser['push']>[number]) => {
    if (l.kind !== 'event') return;
    if (l.event.type === 'done') sawDone = true;
    if (l.event.type === 'error') workerError = `${l.event.code}: ${l.event.message}`;
  };
  const r = await runProcess(opts.binary, blenderArgs(opts.workerScript, jobJson), {
    cwd: dir,
    signal: opts.signal,
    onStdoutChunk: (c) => parser.push(c).forEach(handle),
  }).catch((e: NodeJS.ErrnoException) => {
    throw fail(`không chạy được worker: ${e.message}`);
  });
  parser.flush().forEach(handle);
  if (r.aborted) throw new AppError('CANCELED', 'canceled');
  if (r.code !== 0 || !sawDone || workerError) {
    throw fail(`render thử thất bại (${workerError ?? `mã ${r.code}`})`, { stderr: r.stderrTail });
  }
  const png = await stat(join(dir, 'frames', 'frame_000001.png')).catch(() => null);
  if (!png || png.size === 0) throw fail('render thử không tạo ra ảnh');
  await rm(dir, { recursive: true, force: true });
}
