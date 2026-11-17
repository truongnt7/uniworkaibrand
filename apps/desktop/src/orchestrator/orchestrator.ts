import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventChannel, EventPayload, InvokeHandlers, JobRecord } from '@aps/shared';
import { BlenderRunner } from './blenderRunner.js';
import { openDb, type Db } from './db.js';
import { JobStore } from './jobStore.js';
import { JobQueue, type JobRunner } from './queue.js';
import { RuntimeManager, type RuntimeManagerOptions } from './runtime/manager.js';
import { parseSignedManifest } from './runtime/manifest.js';

export interface OrchestratorConfig {
  dataDir: string;
  workerScript: string;
  manifestPath: string;
  publicKeyPath: string | null;
  ffmpegPath: string;
  /** Dev/test: dùng binary Blender có sẵn thay vì runtime đã tải. */
  blenderOverride?: string | null;
  allowUnsignedManifest?: boolean;
  runtimeOverrides?: Partial<RuntimeManagerOptions>;
  runner?: JobRunner;
  onLog?: (jobId: string, line: string) => void;
}

export type EmitFn = <C extends EventChannel>(channel: C, payload: EventPayload<C>) => void;

export interface Orchestrator {
  handlers: InvokeHandlers;
  queue: JobQueue;
  runtime: RuntimeManager;
  db: Db;
  /** Dừng êm hàng đợi (giữ job dở dang để tiếp tục lần sau) rồi đóng DB. */
  shutdown(): Promise<void>;
  close(): void;
}

export function createOrchestrator(config: OrchestratorConfig, emit: EmitFn): Orchestrator {
  const db = openDb(join(config.dataDir, 'aps.sqlite'));
  const store = new JobStore(db);

  const runtime = new RuntimeManager({
    dir: join(config.dataDir, 'runtime'),
    workerScript: config.workerScript,
    binaryOverride: config.blenderOverride ?? null,
    onProgress: (p) => emit('runtime:progress', p),
    loadManifest: async () => {
      const raw = JSON.parse(await readFile(config.manifestPath, 'utf8')) as unknown;
      const key = config.publicKeyPath ? await readFile(config.publicKeyPath, 'utf8') : null;
      return parseSignedManifest(raw, key, config.allowUnsignedManifest ?? false);
    },
    ...config.runtimeOverrides,
  });

  const runner =
    config.runner ??
    new BlenderRunner({
      jobsDir: join(config.dataDir, 'jobs'),
      workerScript: config.workerScript,
      getBlenderBinary: () => runtime.getBinaryPath(),
      ffmpegPath: config.ffmpegPath,
      onLog: config.onLog,
    });

  const queue = new JobQueue({
    store,
    runner,
    onChange: (job: JobRecord) => emit('jobs:changed', job),
  });

  const handlers: InvokeHandlers = {
    'jobs:list': () => queue.list(),
    'jobs:create': (req) => queue.enqueue(req),
    'jobs:cancel': async ({ id }) => ({ ok: await queue.cancel(id) }),
    'jobs:retry': ({ id }) => ({ ok: queue.retry(id) }),
    'jobs:pause': async ({ id }) => ({ ok: await queue.pause(id) }),
    'jobs:resume': ({ id }) => ({ ok: queue.resume(id) }),
    'jobs:remove': async ({ id }) => ({ ok: await queue.remove(id) }),
    'runtime:status': () => runtime.status(),
    'runtime:install': () => runtime.install(),
    'runtime:importFile': ({ path }) => runtime.importFromFile(path),
  };

  void queue.recover();

  return {
    handlers,
    queue,
    runtime,
    db,
    shutdown: async () => {
      await queue.shutdown();
      db.close();
    },
    close: () => db.close(),
  };
}
