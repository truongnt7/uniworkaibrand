import type { RenderRequestInput } from '@aps/shared';
import type { ExportHandle, ExportRequest, ExportService, LibraryRepository, MotionPreset } from './types';

/** Mô phỏng xuất: tiến độ tăng đều rồi hoàn tất. Dùng khi chưa có runtime Blender hoặc ngoài Electron. */
export class MockExportService implements ExportService {
  constructor(
    private readonly library: LibraryRepository,
    private readonly opts: { tickMs?: number; step?: number } = {},
  ) {}

  async start(request: ExportRequest): Promise<ExportHandle> {
    const item = await this.library.addExporting(toNewExport(request));
    this.simulate(item.id);
    return { libraryItemId: item.id, mode: 'mock' };
  }

  private simulate(id: string): void {
    const tick = this.opts.tickMs ?? 450;
    const step = this.opts.step ?? 0.12;
    let progress = 0;
    const timer = setInterval(() => {
      progress = Math.min(1, progress + step);
      void this.library.updateExport(id, progress >= 1 ? { status: 'done' } : { progress });
      if (progress >= 1) clearInterval(timer);
    }, tick);
  }
}

/** Cầu nối tối thiểu tới IPC job queue của PoC (tách ra để dễ test và thay thế). */
export interface QueueBridge {
  runtimeInstalled(): Promise<boolean>;
  pickModelFile(): Promise<string | null>;
  createJob(request: RenderRequestInput): Promise<{ id: string }>;
  onJobChanged(listener: (job: { id: string; status: string; progress: number }) => void): () => void;
}

const MOTION_TO_JOB: Record<MotionPreset, 'orbit' | 'spin360'> = {
  spin360: 'spin360',
  orbit: 'orbit',
  dollyIn: 'orbit',
  lift: 'orbit',
};

export function toRenderRequest(request: ExportRequest, glbPath: string): RenderRequestInput {
  const { product } = request;
  const video = request.kind === 'video';
  return {
    name: request.name,
    target: 'local',
    product: {
      glbPath,
      sizeMm: product.sizeMm,
    },
    output: {
      kind: request.kind,
      width: request.width,
      height: request.height,
      fps: 30,
      durationS: request.durationS ?? 5,
      motion: MOTION_TO_JOB[request.motion ?? 'spin360'],
      engine: 'eevee',
      samples: video ? 24 : 48,
      device: 'auto',
    },
  };
}

/**
 * Xuất thật qua hàng đợi PoC khi runtime Blender đã sẵn sàng và người dùng chọn được file .glb;
 * ngược lại rơi về mô phỏng để UI luôn dùng được.
 */
export class QueueExportService implements ExportService {
  private readonly jobToItem = new Map<string, string>();
  private off: (() => void) | null = null;

  constructor(
    private readonly library: LibraryRepository,
    private readonly bridge: QueueBridge,
    private readonly fallback: ExportService,
  ) {}

  private ensureSubscribed(): void {
    if (this.off) return;
    this.off = this.bridge.onJobChanged((job) => {
      const itemId = this.jobToItem.get(job.id);
      if (!itemId) return;
      if (job.status === 'done') void this.library.updateExport(itemId, { status: 'done' });
      else if (job.status === 'failed' || job.status === 'canceled') void this.library.updateExport(itemId, { status: 'failed' });
      else void this.library.updateExport(itemId, { progress: job.progress });
    });
  }

  async start(request: ExportRequest): Promise<ExportHandle> {
    try {
      if (!request.product.hasModel3d || !(await this.bridge.runtimeInstalled())) return this.fallback.start(request);
      const glb = await this.bridge.pickModelFile();
      if (!glb) return this.fallback.start(request);
      this.ensureSubscribed();
      const job = await this.bridge.createJob(toRenderRequest(request, glb));
      const item = await this.library.addExporting({ ...toNewExport(request), jobId: job.id });
      this.jobToItem.set(job.id, item.id);
      return { libraryItemId: item.id, mode: 'queue' };
    } catch {
      return this.fallback.start(request);
    }
  }
}

function toNewExport(request: ExportRequest) {
  const ext = request.kind === 'video' ? 'mp4' : 'png';
  const base = request.name.replace(/[^\p{L}\p{N}_-]+/gu, '_');
  return {
    name: `${base}.${ext}`,
    kind: request.kind,
    productId: request.product.id,
    productName: request.product.name,
    width: request.width,
    height: request.height,
    durationS: request.durationS,
    art: { product: request.product.art.product, scene: request.scene ?? request.product.art.scene },
  };
}
