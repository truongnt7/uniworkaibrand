import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { aspectToSize, createProviderFromEnv, direct, type LlmProvider } from '@aps/ai';
import { checkTimelineRequest } from '@aps/render-core';
import { RenderRequest, SCENE_TEMPLATES, type EventChannel, type EventPayload, type InvokeHandlers, type JobRecord } from '@aps/shared';
import { BlenderRunner } from './blenderRunner.js';
import { PipelineRunner, SlideshowRunner } from './slideshowRunner.js';
import { ProfileStore, SettingsStore } from './settings.js';
import { prepareSlideshow, slideshowCaptions, validateSlideshow } from './slideshowService.js';
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
  /** Thay runner Blender (test). Job slideshow vẫn chạy bằng SlideshowRunner trừ khi đặt `slideshowRunner`. */
  runner?: JobRunner;
  slideshowRunner?: JobRunner;
  /** Phông tiếng Việt (TTF) đi kèm app, dùng cho chữ trên video ảnh sang video. */
  fontPath?: string;
  /** Chỉ test: thay provider LLM của Đạo diễn AI (mặc định đọc APS_AI_* từ `env`; không có khóa -> rule-based offline). */
  directorProvider?: () => LlmProvider | null;
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

  const blenderRunner =
    config.runner ??
    new BlenderRunner({
      jobsDir: join(config.dataDir, 'jobs'),
      workerScript: config.workerScript,
      getBlenderBinary: () => runtime.getBinaryPath(),
      getFfmpegPath: () => runtime.getFfmpegPath(),
      onLog: config.onLog,
    });
  const fontPath = config.fontPath ?? '';
  const slideshowRunner =
    config.slideshowRunner ??
    new SlideshowRunner({
      jobsDir: join(config.dataDir, 'jobs'),
      fontPath,
      getFfmpegPath: () => runtime.getFfmpegPath(),
    });
  const runner = new PipelineRunner(blenderRunner, slideshowRunner);
  const settings = new SettingsStore(db);
  const profile = new ProfileStore(settings, join(config.dataDir, 'profile'));

  const queue = new JobQueue({
    store,
    runner,
    onChange: (job: JobRecord) => emit('jobs:changed', job),
  });

  const handlers: InvokeHandlers = {
    'jobs:list': () => queue.list(),
    'jobs:create': (req) => {
      if (req.timeline) checkTimelineRequest(req);
      return queue.enqueue(req);
    },
    'slideshow:validate': (req) => validateSlideshow(req),
    'slideshow:create': async (req) => {
      const prepared = await prepareSlideshow(req, { fontPath });
      return { job: queue.enqueue(prepared.request, prepared.id), warnings: prepared.warnings };
    },
    'slideshow:caption': (req) => slideshowCaptions(req),
    'profile:get': () => profile.get(),
    'profile:set': (patch) => profile.set(patch),
    'jobs:createFromPrompt': async (req) => {
      const provider = config.directorProvider ? config.directorProvider() : createProviderFromEnv('director', config.env ?? process.env);
      const directed = await direct(req.prompt, {
        provider,
        context: {
          availableTemplates: req.availableTemplates ?? SCENE_TEMPLATES,
          hasLogo: Boolean(req.logoPath),
          ...(req.render?.fps ? { fps: req.render.fps } : {}),
          ...(req.product.sizeMm ? { productSizeMm: req.product.sizeMm } : {}),
        },
      });
      const { timeline } = directed;
      const render = req.render ?? {};
      const request = RenderRequest.parse({
        name: req.name ?? 'Video AI',
        target: req.target,
        product: req.product,
        output: {
          kind: 'video',
          ...aspectToSize(timeline.aspect, render.shortSide ?? 720),
          fps: timeline.fps,
          durationS: timeline.duration_s,
          ...(render.engine ? { engine: render.engine } : {}),
          ...(render.samples ? { samples: render.samples } : {}),
          ...(render.device ? { device: render.device } : {}),
          ...(req.logoPath ? { logoPath: req.logoPath } : {}),
        },
        timeline,
        ...(req.extras ? { extras: req.extras } : {}),
      });
      const checked = checkTimelineRequest(request);
      const job = queue.enqueue(request);
      return {
        job,
        director: {
          source: directed.source,
          warnings: [...directed.warnings, ...checked.warnings],
          fixes: directed.fixes,
          ...(directed.fallbackReason ? { fallbackReason: directed.fallbackReason } : {}),
        },
      };
    },
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
