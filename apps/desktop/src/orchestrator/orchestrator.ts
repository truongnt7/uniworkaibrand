import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EventChannel, EventPayload, InvokeHandlers, JobRecord } from '@aps/shared';
import { BlenderRunner } from './blenderRunner.js';
import { openDb, type Db } from './db.js';
import { JobStore } from './jobStore.js';
import { JobQueue, type JobRunner } from './queue.js';
import { RuntimeManager, type RuntimeManagerOptions } from './runtime/manager.js';
import { parseSignedManifest, type ManifestTrust } from './runtime/manifest.js';
import { loadTrustedKeys } from './runtime/trust.js';

export interface OrchestratorConfig {
  dataDir: string;
  workerScript: string;
  manifestPath: string;
  /** Thư mục khóa công khai production (`<keyId>.pub.pem`). Không có khóa nào -> không cài được runtime (MANIFEST_NO_TRUSTED_KEY). */
  productionKeysDir: string | null;
  /** true cho app đóng gói/bản phát hành: không bao giờ nạp khóa dev. */
  release: boolean;
  /** Dev/test: dùng binary Blender có sẵn thay vì runtime đã tải. */
  blenderOverride?: string | null;
  /** Dev/test: ffmpeg có sẵn (vẫn bị kiểm chính sách LGPL). */
  ffmpegOverride?: string | null;
  /** Chỉ dùng trong test của orchestrator. */
  allowUnsignedManifest?: boolean;
  env?: NodeJS.ProcessEnv;
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

  let trustCache: Promise<ManifestTrust> | null = null;
  const trust = (): Promise<ManifestTrust> => {
    trustCache ??= loadTrustedKeys({ productionKeysDir: config.productionKeysDir, release: config.release, env: config.env }).then((keys) => ({
      keys,
      allowUnsigned: config.allowUnsignedManifest ?? false,
    }));
    return trustCache;
  };

  const runtime = new RuntimeManager({
    dir: join(config.dataDir, 'runtime'),
    workerScript: config.workerScript,
    binaryOverride: config.blenderOverride ?? null,
    ffmpegOverride: config.ffmpegOverride ?? null,
    onProgress: (p) => emit('runtime:progress', p),
    loadManifest: async () => {
      const raw = JSON.parse(await readFile(config.manifestPath, 'utf8')) as unknown;
      return parseSignedManifest(raw, await trust());
    },
    parseManifest: async (raw) => parseSignedManifest(raw, await trust()),
    ...config.runtimeOverrides,
  });

  const runner =
    config.runner ??
    new BlenderRunner({
      jobsDir: join(config.dataDir, 'jobs'),
      workerScript: config.workerScript,
      getBlenderBinary: () => runtime.getBinaryPath(),
      getFfmpegPath: () => runtime.getFfmpegPath(),
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
