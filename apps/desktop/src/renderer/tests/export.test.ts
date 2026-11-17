import { describe, expect, it, vi } from 'vitest';
import { RenderRequest } from '@aps/shared';
import { MockExportService, QueueExportService, toRenderRequest, type QueueBridge } from '../src/services/export';
import { MockLibraryRepository } from '../src/services/mock/repositories';
import { PRODUCTS } from '../src/services/mock/data';
import type { ExportRequest } from '../src/services/types';

const serum = PRODUCTS[0]!;
const cream = PRODUCTS[2]!;
const request = (over: Partial<ExportRequest> = {}): ExportRequest => ({
  kind: 'video',
  product: serum,
  name: 'Serum Xoay 360°',
  width: 1920,
  height: 1080,
  durationS: 15,
  lockLabel: true,
  motion: 'spin360',
  ...over,
});

function fakeBridge(over: Partial<QueueBridge> = {}) {
  let listener: Parameters<QueueBridge['onJobChanged']>[0] = () => undefined;
  const bridge: QueueBridge = {
    runtimeInstalled: vi.fn(async () => true),
    pickModelFile: vi.fn(async () => '/tmp/serum.glb'),
    createJob: vi.fn(async () => ({ id: 'job-1' })),
    onJobChanged: vi.fn((l) => {
      listener = l;
      return () => undefined;
    }),
    ...over,
  };
  return { bridge, emit: (job: Parameters<typeof listener>[0]) => listener(job) };
}

describe('toRenderRequest', () => {
  it('tạo RenderRequest hợp lệ theo schema dùng chung của job queue', () => {
    const parsed = RenderRequest.parse(toRenderRequest(request(), '/tmp/serum.glb'));
    expect(parsed.target).toBe('local');
    expect(parsed.output.kind).toBe('video');
    expect(parsed.output.motion).toBe('spin360');
    expect(parsed.output.durationS).toBe(15);
    expect(parsed.product.glbPath).toBe('/tmp/serum.glb');
    const image = RenderRequest.parse(toRenderRequest(request({ kind: 'image', width: 2048, height: 2048, durationS: null }), '/tmp/serum.glb'));
    expect(image.output.kind).toBe('image');
  });
});

describe('MockExportService', () => {
  it('thêm mục "Đang xuất" vào thư viện rồi hoàn tất', async () => {
    const lib = new MockLibraryRepository();
    const svc = new MockExportService(lib, { tickMs: 5, step: 0.5 });
    const h = await svc.start(request());
    expect(h.mode).toBe('mock');
    const first = (await lib.get(h.libraryItemId))!;
    expect(first.status).toBe('exporting');
    expect(first.name).toBe('Serum_Xoay_360_.mp4');
    await vi.waitFor(async () => expect((await lib.get(h.libraryItemId))!.status).toBe('done'), { timeout: 2000 });
    expect((await lib.get(h.libraryItemId))!.progress).toBe(1);
  });
});

describe('QueueExportService (nối IPC job queue)', () => {
  it('tạo job thật khi runtime sẵn sàng và cập nhật tiến độ/hoàn tất từ jobs:changed', async () => {
    const lib = new MockLibraryRepository();
    const { bridge, emit } = fakeBridge();
    const svc = new QueueExportService(lib, bridge, new MockExportService(lib));
    const h = await svc.start(request());
    expect(h.mode).toBe('queue');
    expect(bridge.createJob).toHaveBeenCalledTimes(1);
    expect(RenderRequest.safeParse(vi.mocked(bridge.createJob).mock.calls[0]![0]).success).toBe(true);
    expect((await lib.get(h.libraryItemId))!.jobId).toBe('job-1');
    emit({ id: 'job-1', status: 'rendering', progress: 0.4 });
    await vi.waitFor(async () => expect((await lib.get(h.libraryItemId))!.progress).toBeCloseTo(0.4));
    emit({ id: 'job-1', status: 'done', progress: 1 });
    await vi.waitFor(async () => expect((await lib.get(h.libraryItemId))!.status).toBe('done'));
  });

  it('job lỗi đánh dấu mục xuất lỗi', async () => {
    const lib = new MockLibraryRepository();
    const { bridge, emit } = fakeBridge();
    const h = await new QueueExportService(lib, bridge, new MockExportService(lib)).start(request());
    emit({ id: 'job-1', status: 'failed', progress: 0.2 });
    await vi.waitFor(async () => expect((await lib.get(h.libraryItemId))!.status).toBe('failed'));
  });

  it('rơi về mô phỏng khi chưa có runtime, không chọn file, sản phẩm chỉ có ảnh hoặc IPC lỗi', async () => {
    for (const [product, over] of [
      [serum, { runtimeInstalled: async () => false }],
      [serum, { pickModelFile: async () => null }],
      [cream, {}],
      [serum, { createJob: async () => Promise.reject(new Error('IPC')) }],
    ] as const) {
      const lib = new MockLibraryRepository();
      const { bridge } = fakeBridge(over);
      const h = await new QueueExportService(lib, bridge, new MockExportService(lib, { tickMs: 1000 })).start(request({ product }));
      expect(h.mode).toBe('mock');
    }
  });
});
