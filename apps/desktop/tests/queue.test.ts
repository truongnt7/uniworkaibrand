import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, RenderRequest, type JobRecord, type RenderRequestInput } from '@aps/shared';
import { openDb } from '../src/orchestrator/db.js';
import { JobStore } from '../src/orchestrator/jobStore.js';
import { JobQueue, type JobRunner, type RunControl } from '../src/orchestrator/queue.js';
import { InvalidTransitionError, canTransition, transition } from '../src/orchestrator/stateMachine.js';

const req = (over: Partial<RenderRequestInput> = {}, output: Record<string, unknown> = {}): RenderRequestInput => ({
  product: { glbPath: '/x.glb' },
  output: { kind: 'video', fps: 10, durationS: 1, ...output } as RenderRequestInput['output'],
  ...over,
});

function setup(runner: JobRunner, path = ':memory:') {
  const db = openDb(path);
  const store = new JobStore(db);
  const changes: JobRecord[] = [];
  const queue = new JobQueue({ store, runner, emitThrottleMs: 0, onChange: (j) => changes.push(j) });
  return { db, store, queue, changes };
}

function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const instantRunner = (log: string[] = []): JobRunner => ({
  async run(job, ctl) {
    log.push(job.id);
    ctl.enter('rendering');
    for (let f = 1; f <= job.totalFrames; f++) ctl.progress({ frame: f });
    if (job.kind === 'video') {
      ctl.enter('encoding');
      ctl.encodeProgress(job.totalFrames);
    }
    return { outputPath: `/out/${job.id}` };
  },
});

describe('state machine', () => {
  it('đường đi hợp lệ queued → … → done', () => {
    let s = transition('queued', 'start');
    expect(s).toBe('preparing');
    s = transition(s, 'render_started');
    expect(s).toBe('rendering');
    s = transition(s, 'encode_started');
    expect(s).toBe('encoding');
    expect(transition(s, 'finish')).toBe('done');
  });

  it('từ chối chuyển trạng thái sai', () => {
    expect(() => transition('done', 'cancel')).toThrow(InvalidTransitionError);
    expect(() => transition('queued', 'finish')).toThrow(InvalidTransitionError);
    expect(canTransition('failed', 'retry')).toBe(true);
    expect(canTransition('done', 'retry')).toBe(false);
  });

  it('job dở dang có thể recover về queued', () => {
    for (const s of ['preparing', 'rendering', 'encoding'] as const) expect(transition(s, 'recover')).toBe('queued');
  });
});

describe('JobQueue', () => {
  const cleanup: string[] = [];
  afterEach(() => {
    for (const d of cleanup.splice(0)) rmSync(d, { recursive: true, force: true });
  });

  it('chạy job qua đủ 5 trạng thái và lưu kết quả', async () => {
    const { queue, changes } = setup(instantRunner());
    const job = queue.enqueue(req());
    await queue.idle();
    const done = queue.get(job.id)!;
    expect(done.status).toBe('done');
    expect(done.progress).toBe(1);
    expect(done.outputPath).toBe(`/out/${job.id}`);
    expect(done.attempts).toBe(1);
    const seen = [...new Set(changes.filter((c) => c.id === job.id).map((c) => c.status))];
    expect(seen).toEqual(['queued', 'preparing', 'rendering', 'encoding', 'done']);
  });

  it('ảnh bỏ qua trạng thái encoding', async () => {
    const { queue, changes } = setup(instantRunner());
    const job = queue.enqueue(req({}, { kind: 'image' }));
    await queue.idle();
    expect(changes.some((c) => c.id === job.id && c.status === 'encoding')).toBe(false);
    expect(queue.get(job.id)!.status).toBe('done');
  });

  it('chỉ chạy 1 job tại một thời điểm và ưu tiên preview trước final', async () => {
    const order: string[] = [];
    let active = 0;
    let maxActive = 0;
    const gate = deferred();
    const runner: JobRunner = {
      async run(job, ctl) {
        active++;
        maxActive = Math.max(maxActive, active);
        order.push(job.name);
        ctl.enter('rendering');
        if (job.name === 'first') await gate.promise;
        active--;
        return { outputPath: '/o' };
      },
    };
    const { queue } = setup(runner);
    queue.enqueue(req({ name: 'first' }, { kind: 'image' }));
    queue.enqueue(req({ name: 'final-1', priority: 'final' }, { kind: 'image' }));
    queue.enqueue(req({ name: 'preview-1', priority: 'preview' }, { kind: 'image' }));
    gate.resolve();
    await queue.idle();
    expect(maxActive).toBe(1);
    expect(order).toEqual(['first', 'preview-1', 'final-1']);
  });

  it('job target=cloud được lưu và hiển thị nhưng không bao giờ chạy local', async () => {
    const ran: string[] = [];
    const { queue } = setup(instantRunner(ran));
    const cloud = queue.enqueue(req({ name: 'cloud', target: 'cloud' }));
    const local = queue.enqueue(req({ name: 'local' }));
    await queue.idle();
    expect(queue.get(cloud.id)).toMatchObject({ status: 'queued', target: 'cloud' });
    expect(queue.get(local.id)!.status).toBe('done');
    expect(ran).toEqual([local.id]);
  });

  it('ghi mã lỗi có cấu trúc khi runner thất bại, rồi retry thành công', async () => {
    let attempt = 0;
    const runner: JobRunner = {
      async run(_job, ctl) {
        ctl.enter('rendering');
        if (++attempt === 1) throw new AppError('GLB_NOT_FOUND', 'không thấy glb');
        return { outputPath: '/o' };
      },
    };
    const { queue } = setup(runner);
    const job = queue.enqueue(req());
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'failed', errorCode: 'GLB_NOT_FOUND', errorMessage: 'không thấy glb' });
    expect(queue.retry(job.id)).toBe(true);
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'done', errorCode: null, attempts: 2 });
  });

  it('lỗi không phải AppError -> mã UNKNOWN', async () => {
    const { queue } = setup({
      async run() {
        throw new Error('boom');
      },
    });
    const job = queue.enqueue(req());
    await queue.idle();
    expect(queue.get(job.id)).toMatchObject({ status: 'needs_attention', errorCode: 'UNKNOWN', errorMessage: 'boom', failures: 3 });
  });

  it('hủy job đang chờ', async () => {
    const gate = deferred();
    const { queue } = setup({
      async run(_j, ctl) {
        ctl.enter('rendering');
        await gate.promise;
        return { outputPath: '/o' };
      },
    });
    queue.enqueue(req({ name: 'blocker' }));
    const waiting = queue.enqueue(req({ name: 'waiting' }));
    expect(await queue.cancel(waiting.id)).toBe(true);
    expect(queue.get(waiting.id)!.status).toBe('canceled');
    gate.resolve();
    await queue.idle();
  });

  it('hủy job đang chạy: truyền AbortSignal và kết thúc ở trạng thái canceled', async () => {
    const started = deferred();
    const { queue } = setup({
      async run(_j, ctl: RunControl) {
        ctl.enter('rendering');
        started.resolve();
        await new Promise<void>((_res, rej) => ctl.signal.addEventListener('abort', () => rej(new AppError('CANCELED', 'x'))));
        return { outputPath: '/never' };
      },
    });
    const job = queue.enqueue(req());
    await started.promise;
    expect(await queue.cancel(job.id)).toBe(true);
    expect(queue.get(job.id)).toMatchObject({ status: 'canceled', errorCode: null });
    expect(queue.retry(job.id)).toBe(true);
  });

  it('không retry/cancel job đã done; không xóa job đang chạy', async () => {
    const gate = deferred();
    const { queue } = setup({
      async run(job, ctl) {
        ctl.enter('rendering');
        if (job.name === 'slow') await gate.promise;
        return { outputPath: '/o' };
      },
    });
    const slow = queue.enqueue(req({ name: 'slow' }, { kind: 'image' }));
    expect(await queue.remove(slow.id)).toBe(false);
    gate.resolve();
    await queue.idle();
    expect(queue.retry(slow.id)).toBe(false);
    expect(await queue.cancel(slow.id)).toBe(false);
    expect(await queue.remove(slow.id)).toBe(true);
    expect(queue.get(slow.id)).toBeNull();
  });

  it('khôi phục job dở dang sau khi app bị tắt giữa chừng, giữ nguyên tiến độ khung', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aps-queue-'));
    cleanup.push(dir);
    const dbPath = join(dir, 'q.sqlite');

    const started = deferred();
    const first = setup(
      {
        async run(_j, ctl) {
          ctl.enter('rendering');
          ctl.progress({ frame: 4 });
          started.resolve();
          await new Promise(() => {}); // treo: mô phỏng app bị kill, runner không bao giờ kết thúc
          return { outputPath: '/never' };
        },
      },
      dbPath,
    );
    const job = first.queue.enqueue(req({}, { fps: 10, durationS: 1 }));
    await started.promise;
    expect(first.store.get(job.id)).toMatchObject({ status: 'rendering', frame: 4 });

    const seenFrames: number[] = [];
    const second = setup(
      {
        async run(j, ctl) {
          seenFrames.push(j.frame);
          ctl.enter('rendering');
          for (let f = 1; f <= j.totalFrames; f++) ctl.progress({ frame: f, skipped: f <= 4 });
          ctl.enter('encoding');
          return { outputPath: '/resumed' };
        },
      },
      dbPath,
    );
    const recovered = await second.queue.recover();
    expect(recovered.map((j) => j.id)).toEqual([job.id]);
    await second.queue.idle();
    expect(second.queue.get(job.id)).toMatchObject({ status: 'done', outputPath: '/resumed' });
    expect(seenFrames).toEqual([4]);
    first.db.close();
    second.db.close();
  });

  it('thoát êm (shutdown): dừng runner, xếp job dở dang lại đầu hàng đợi (không tính lỗi) để lần sau chạy tiếp', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aps-queue-'));
    cleanup.push(dir);
    const dbPath = join(dir, 'q.sqlite');
    const started = deferred();
    let aborted = false;
    const first = setup(
      {
        async run(_j, ctl) {
          ctl.enter('rendering');
          ctl.progress({ frame: 2 });
          started.resolve();
          await new Promise<void>((_r, rej) =>
            ctl.signal.addEventListener('abort', () => {
              aborted = true;
              rej(new AppError('CANCELED', 'x'));
            }),
          );
          return { outputPath: '/never' };
        },
      },
      dbPath,
    );
    const job = first.queue.enqueue(req());
    await started.promise;
    await first.queue.shutdown();
    expect(aborted).toBe(true);
    expect(first.store.get(job.id)).toMatchObject({ status: 'queued', frame: 2, errorCode: null, failures: 0 });

    const second = setup(
      {
        async run(_j, ctl) {
          ctl.enter('rendering');
          return { outputPath: '/ok' };
        },
      },
      dbPath,
    );
    await second.queue.recover();
    await second.queue.idle();
    expect(second.queue.get(job.id)).toMatchObject({ status: 'done', failures: 0 });
    first.db.close();
    second.db.close();
  });

  it('crash (kill -9): job đang chạy được reclaim Blender mồ côi, tính 1 lần lỗi và chạy tiếp', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aps-queue-'));
    cleanup.push(dir);
    const dbPath = join(dir, 'q.sqlite');
    const started = deferred();
    const first = setup(
      {
        async run(_j, ctl) {
          ctl.enter('rendering');
          started.resolve();
          await new Promise(() => {});
          return { outputPath: '/never' };
        },
      },
      dbPath,
    );
    const job = first.queue.enqueue(req());
    await started.promise;
    const reclaimed: string[] = [];
    const second = setup(
      {
        async run(_j, ctl) {
          ctl.enter('rendering');
          return { outputPath: '/ok' };
        },
        reclaim: (j) => void reclaimed.push(j.id),
      },
      dbPath,
    );
    await second.queue.recover();
    await second.queue.idle();
    expect(reclaimed).toEqual([job.id]);
    expect(second.queue.get(job.id)).toMatchObject({ status: 'done', failures: 1 });
    first.db.close();
    second.db.close();
  });

  it('request được lưu nguyên vẹn (zod-validated) và job bị từ chối nếu schema sai', () => {
    const { queue } = setup(instantRunner());
    const job = queue.enqueue(req({ name: 'Serum' }, { width: 640 }));
    expect(RenderRequest.parse(job.request).output.width).toBe(640);
    expect(() => queue.enqueue({ product: { glbPath: '' }, output: { kind: 'image' } })).toThrow();
  });
});
