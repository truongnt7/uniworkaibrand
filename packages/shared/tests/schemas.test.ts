import { describe, expect, it } from 'vitest';
import {
  RenderRequest,
  WorkerEvent,
  WorkerJob,
  dispatchInvoke,
  IpcValidationError,
  totalFramesFor,
  RuntimeManifest,
} from '../src/index.js';

const baseRequest = {
  product: { glbPath: '/tmp/bottle.glb' },
  output: { kind: 'video' as const },
};

describe('RenderRequest', () => {
  it('điền giá trị mặc định cho video', () => {
    const r = RenderRequest.parse(baseRequest);
    expect(r.target).toBe('local');
    expect(r.priority).toBe('final');
    expect(r.output).toMatchObject({ width: 1280, height: 720, fps: 30, durationS: 5, motion: 'orbit', engine: 'eevee' });
    expect(r.scene.backgroundColor).toBe('#e9e4dc');
    expect(totalFramesFor(r.output)).toBe(150);
  });

  it('ảnh luôn có đúng 1 khung', () => {
    const r = RenderRequest.parse({ ...baseRequest, output: { kind: 'image' } });
    expect(totalFramesFor(r.output)).toBe(1);
  });

  it('từ chối giá trị ngoài giới hạn', () => {
    expect(RenderRequest.safeParse({ ...baseRequest, output: { kind: 'video', fps: 240 } }).success).toBe(false);
    expect(RenderRequest.safeParse({ ...baseRequest, output: { kind: 'video', width: 10 } }).success).toBe(false);
    expect(RenderRequest.safeParse({ ...baseRequest, output: { kind: 'video', durationS: 3600 } }).success).toBe(false);
    expect(RenderRequest.safeParse({ ...baseRequest, scene: { backgroundColor: 'red' } }).success).toBe(false);
    expect(RenderRequest.safeParse({ product: { glbPath: '' }, output: { kind: 'image' } }).success).toBe(false);
  });

  it('nhận cấu hình nhãn trụ', () => {
    const r = RenderRequest.parse({
      ...baseRequest,
      product: { glbPath: 'a.glb', label: { imagePath: 'l.png', widthMm: 60, heightMm: 40, bottomMm: 30 } },
    });
    expect(r.product.label?.mode).toBe('cylinder');
    expect(r.product.label?.centerDeg).toBe(0);
  });
});

describe('WorkerEvent (JSON-lines)', () => {
  it('parse các sự kiện hợp lệ', () => {
    expect(WorkerEvent.parse({ type: 'progress', phase: 'render', frame: 12, total: 450 })).toMatchObject({ frame: 12 });
    expect(WorkerEvent.parse({ type: 'error', code: 'GLB_NOT_FOUND', message: 'x' }).type).toBe('error');
    expect(WorkerEvent.parse({ type: 'device', engine: 'cycles', device: 'CPU' })).toMatchObject({ fallbackToCpu: false });
  });

  it('từ chối sự kiện lạ hoặc thiếu trường', () => {
    expect(WorkerEvent.safeParse({ type: 'nope' }).success).toBe(false);
    expect(WorkerEvent.safeParse({ type: 'progress', phase: 'render', frame: -1, total: 3 }).success).toBe(false);
  });
});

describe('WorkerJob', () => {
  it('điền giới hạn mặc định', () => {
    const j = WorkerJob.parse({
      version: 1,
      mode: 'render',
      jobId: 'j1',
      scene: { template: 'studio-soft', backgroundColor: '#ffffff', shadow: 0.5 },
      motion: 'orbit',
      render: { engine: 'eevee', samples: 8, width: 320, height: 180, device: 'auto' },
      frames: { total: 4, angleStartDeg: 0, angleSpanDeg: 360 },
      paths: { framesDir: '/tmp/f' },
    });
    expect(j.paths.pattern).toBe('frame_%06d.png');
    expect(j.limits.maxTriangles).toBeGreaterThan(0);
  });
});

describe('dispatchInvoke', () => {
  it('từ chối kênh lạ', async () => {
    await expect(dispatchInvoke({}, 'fs:readAnything', {})).rejects.toBeInstanceOf(IpcValidationError);
    await expect(dispatchInvoke({}, '__proto__', {})).rejects.toBeInstanceOf(IpcValidationError);
  });

  it('từ chối payload sai schema, không gọi handler', async () => {
    let called = false;
    const handlers = {
      'jobs:create': () => {
        called = true;
        throw new Error('should not run');
      },
    };
    await expect(dispatchInvoke(handlers, 'jobs:create', { product: { glbPath: 1 } })).rejects.toBeInstanceOf(IpcValidationError);
    expect(called).toBe(false);
  });

  it('gọi handler với dữ liệu đã chuẩn hóa', async () => {
    const out = await dispatchInvoke(
      { 'jobs:cancel': (req) => ({ ok: req.id === 'abc' }) },
      'jobs:cancel',
      { id: 'abc' },
    );
    expect(out).toEqual({ ok: true });
  });
});

describe('RuntimeManifest', () => {
  it('chỉ chấp nhận Blender 4.5.x LTS', () => {
    const art = { url: 'https://x/y.tar.xz', size: 1, sha256: 'a'.repeat(64), archive: 'tar.xz', binary: 'blender' };
    expect(RuntimeManifest.safeParse({ schemaVersion: 1, blender: { version: '4.5.16', channel: 'LTS', artifacts: { 'linux-x64': art } } }).success).toBe(true);
    expect(RuntimeManifest.safeParse({ schemaVersion: 1, blender: { version: '5.0.1', channel: 'LTS', artifacts: { 'linux-x64': art } } }).success).toBe(false);
  });
});
