import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { AppError, type JobRecord, type RenderRequestInput } from '@aps/shared';
import { MIGRATIONS, migrate, openDb } from '../src/orchestrator/db.js';
import { JobStore } from '../src/orchestrator/jobStore.js';
import { JobQueue, type JobRunner } from '../src/orchestrator/queue.js';

const req = (name = 'j', over: Partial<RenderRequestInput> = {}): RenderRequestInput => ({
  name,
  product: { glbPath: '/x.glb' },
  output: { kind: 'image' },
  ...over,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

function mk(runner: JobRunner, path = ':memory:', maxFailures = 3) {
  const db = openDb(path);
  const store = new JobStore(db);
  const changes: JobRecord[] = [];
  const queue = new JobQueue({ store, runner, emitThrottleMs: 0, maxFailures, onChange: (j) => changes.push(j) });
  return { db, store, queue, changes };
}

const ok: JobRunner = {
  async run(_j, ctl) {
    ctl.enter('rendering');
    return { outputPath: '/ok' };
  },
};

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'aps-res-'));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('migration SQLite', () => {
  function seedV1(path: string): void {
    const db = new DatabaseSync(path);
    db.exec(MIGRATIONS[0] as string);
    db.exec('PRAGMA user_version = 1');
    const ins = db.prepare(
      `INSERT INTO jobs (id, name, target, priority, status, kind, engine, request_json, frame, total_frames, attempts, created_at, updated_at)
       VALUES (?, ?, 'local', 'final', ?, 'image', 'eevee', ?, ?, 1, 2, ?, ?)`,
    );
    const body = JSON.stringify({ name: 'x', target: 'local', priority: 'final', product: { glbPath: '/x.glb' }, scene: {}, output: { kind: 'image' } });
    ins.run('a', 'cũ-1', 'done', body, 1, 100, 100);
    ins.run('b', 'cũ-2', 'rendering', body, 0, 200, 200);
    ins.run('c', 'cũ-3', 'queued', body, 0, 300, 300);
    db.close();
  }

  it('v1 → v2: giữ nguyên dữ liệu và thứ tự, tạo bản sao lưu, chấp nhận trạng thái mới', () => {
    const dir = tmp();
    const path = join(dir, 'aps.sqlite');
    seedV1(path);
    const db = openDb(path);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(MIGRATIONS.length);
    expect(existsSync(`${path}.bak-v1`)).toBe(true);
    const store = new JobStore(db);
    expect(store.list().map((j) => [j.id, j.status, j.failures])).toEqual([
      ['c', 'queued', 0],
      ['b', 'rendering', 0],
      ['a', 'done', 0],
    ]);
    store.update('c', { status: 'needs_attention', failures: 3 });
    store.update('a', { status: 'paused' });
    expect(store.get('c')).toMatchObject({ status: 'needs_attention', failures: 3 });
    expect(() => db.prepare("UPDATE jobs SET status='bogus' WHERE id='a'").run()).toThrow();
    db.close();
  });

  it('bản sao lưu v1 mở lại và chạy migration lần nữa vẫn ra kết quả đúng (idempotent)', () => {
    const dir = tmp();
    const path = join(dir, 'aps.sqlite');
    seedV1(path);
    openDb(path).close();
    const again = openDb(path);
    expect(again.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 3 });
    again.close();
    copyFileSync(`${path}.bak-v1`, `${path}.restore`);
    const restored = new DatabaseSync(`${path}.restore`);
    migrate(restored, null);
    expect(restored.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 3 });
    restored.close();
  });

  it('migration lỗi giữa chừng thì rollback, DB vẫn ở v1 nguyên vẹn', () => {
    const dir = tmp();
    const path = join(dir, 'aps.sqlite');
    seedV1(path);
    const db = new DatabaseSync(path);
    db.exec('CREATE TABLE jobs_v2 (x)');
    expect(() => migrate(db, path)).toThrow();
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM jobs').get()).toEqual({ n: 3 });
    db.close();
  });
});

describe('thứ tự và job lỗi lặp lại', () => {
  it('khởi động lại: job bị gián đoạn chạy trước, các job còn lại giữ nguyên thứ tự cũ', async () => {
    const dir = tmp();
    const path = join(dir, 'q.sqlite');
    const gate = deferred();
    const started = deferred();
    const first = mk(
      {
        async run(_j, ctl) {
          ctl.enter('rendering');
          started.resolve();
          await gate.promise;
          return { outputPath: '/x' };
        },
      },
      path,
    );
    const a = first.queue.enqueue(req('A'));
    await started.promise;
    const b = first.queue.enqueue(req('B'));
    const c = first.queue.enqueue(req('C'));
    const order: string[] = [];
    const second = mk(
      {
        async run(j, ctl) {
          order.push(j.name);
          ctl.enter('rendering');
          return { outputPath: '/y' };
        },
      },
      path,
    );
    await second.queue.recover();
    await second.queue.idle();
    expect(order).toEqual(['A', 'B', 'C']);
    expect([a, b, c].map((j) => second.queue.get(j.id)!.status)).toEqual(['done', 'done', 'done']);
    first.db.close();
    second.db.close();
  });

  it('job preview vẫn đi trước final nhưng sau job vừa bị gián đoạn', async () => {
    const path = join(tmp(), 'q.sqlite');
    const started = deferred();
    const first = mk(
      {
        async run(_j, ctl) {
          ctl.enter('rendering');
          started.resolve();
          await new Promise(() => {});
          return { outputPath: '/x' };
        },
      },
      path,
    );
    first.queue.enqueue(req('A'));
    await started.promise;
    first.queue.enqueue(req('F'));
    first.queue.enqueue(req('P', { priority: 'preview' }));
    const order: string[] = [];
    const second = mk({ ...ok, run: async (j, ctl) => (order.push(j.name), ok.run(j, ctl)) }, path);
    await second.queue.recover();
    await second.queue.idle();
    expect(order).toEqual(['A', 'P', 'F']);
    first.db.close();
    second.db.close();
  });

  it('job lỗi tạm thời được thử lại tự động, quá ngưỡng thì needs_attention và KHÔNG chặn job sau', async () => {
    let bad = 0;
    const done: string[] = [];
    const { queue, changes } = mk({
      async run(j, ctl) {
        ctl.enter('rendering');
        if (j.name === 'bad') {
          bad++;
          throw new AppError('RENDER_FAILED', 'hỏng');
        }
        done.push(j.name);
        return { outputPath: '/ok' };
      },
    });
    const b = queue.enqueue(req('bad'));
    const g = queue.enqueue(req('good'));
    await queue.idle();
    expect(bad).toBe(3);
    expect(queue.get(b.id)).toMatchObject({ status: 'needs_attention', failures: 3, errorCode: 'RENDER_FAILED' });
    expect(queue.get(g.id)!.status).toBe('done');
    expect(done).toEqual(['good']);
    expect(changes.filter((c) => c.id === b.id).map((c) => c.status)).toContain('needs_attention');
    // người dùng can thiệp: thử lại -> đặt lại bộ đếm
    expect(queue.retry(b.id)).toBe(true);
    await queue.idle();
    expect(queue.get(b.id)).toMatchObject({ status: 'needs_attention', failures: 3 });
  });

  it('lỗi tất định (GLB_NOT_FOUND) báo failed ngay, không thử lại', async () => {
    let n = 0;
    const { queue } = mk({
      async run() {
        n++;
        throw new AppError('GLB_NOT_FOUND', 'x');
      },
    });
    const j = queue.enqueue(req());
    await queue.idle();
    expect(n).toBe(1);
    expect(queue.get(j.id)).toMatchObject({ status: 'failed', failures: 1 });
  });

  it('job làm app crash lặp lại (poison) bị đưa sang needs_attention khi khởi động, không kẹt hàng đợi', async () => {
    const path = join(tmp(), 'q.sqlite');
    let id = '';
    for (let round = 0; round < 3; round++) {
      const started = deferred();
      const inst = mk(
        {
          async run(_j, ctl) {
            ctl.enter('rendering');
            started.resolve();
            await new Promise(() => {});
            return { outputPath: '/x' };
          },
        },
        path,
      );
      if (round === 0) {
        id = inst.queue.enqueue(req('poison')).id;
        inst.queue.enqueue(req('healthy'));
      } else {
        await inst.queue.recover();
      }
      await started.promise;
      inst.db.close(); // mô phỏng crash: không shutdown êm
    }
    const last = mk(ok, path);
    await last.queue.recover();
    await last.queue.idle();
    expect(last.queue.get(id)).toMatchObject({ status: 'needs_attention', errorCode: 'INTERRUPTED', failures: 3 });
    expect(last.queue.list().find((j) => j.name === 'healthy')!.status).toBe('done');
    last.db.close();
  });
});

describe('tạm dừng / hủy', () => {
  it('pause job đang chờ rồi resume', async () => {
    const gate = deferred();
    const { queue } = mk({
      async run(_j, ctl) {
        ctl.enter('rendering');
        await gate.promise;
        return { outputPath: '/o' };
      },
    });
    const a = queue.enqueue(req('A'));
    const b = queue.enqueue(req('B'));
    expect(await queue.pause(b.id)).toBe(true);
    expect(queue.get(b.id)!.status).toBe('paused');
    gate.resolve();
    await queue.idle();
    expect(queue.get(a.id)!.status).toBe('done');
    expect(queue.get(b.id)!.status).toBe('paused');
    expect(queue.resume(b.id)).toBe(true);
    await queue.idle();
    expect(queue.get(b.id)!.status).toBe('done');
  });

  it('pause job đang chạy: dừng runner, giữ khung đã render, KHÔNG tính lỗi; resume chạy tiếp', async () => {
    const started = deferred();
    let runs = 0;
    const { queue } = mk({
      async run(j, ctl) {
        runs++;
        ctl.enter('rendering');
        if (runs === 1) {
          ctl.progress({ frame: 1 });
          started.resolve();
          await new Promise<void>((_r, rej) => ctl.signal.addEventListener('abort', () => rej(new AppError('CANCELED', 'x'))));
        }
        return { outputPath: '/o' };
      },
    });
    const j = queue.enqueue(req('A', { output: { kind: 'video', fps: 5, durationS: 1 } as never }));
    await started.promise;
    expect(await queue.pause(j.id)).toBe(true);
    expect(queue.get(j.id)).toMatchObject({ status: 'paused', frame: 1, failures: 0, errorCode: null });
    expect(queue.resume(j.id)).toBe(true);
    await queue.idle();
    expect(queue.get(j.id)).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('hủy job đang paused và needs_attention; pause job đã xong bị từ chối', async () => {
    const { queue } = mk(ok);
    const a = queue.enqueue(req('A'));
    await queue.idle();
    expect(await queue.pause(a.id)).toBe(false);
    expect(queue.resume(a.id)).toBe(false);

    const gate = deferred();
    const q2 = mk({
      async run(_j, ctl) {
        ctl.enter('rendering');
        await gate.promise;
        return { outputPath: '/o' };
      },
    }).queue;
    q2.enqueue(req('run'));
    const p = q2.enqueue(req('P'));
    await q2.pause(p.id);
    expect(await q2.cancel(p.id)).toBe(true);
    expect(q2.get(p.id)!.status).toBe('canceled');
    gate.resolve();
    await q2.idle();
  });
});
