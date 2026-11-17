import { AppError, RenderRequest, type JobRecord, type RenderRequestInput } from '@aps/shared';
import { estimateRemainingSeconds, overallProgress } from '@aps/render-core';
import type { JobStore } from './jobStore.js';
import { transition } from './stateMachine.js';

export interface RunControl {
  signal: AbortSignal;
  /** Chuyển sang giai đoạn tiếp theo (preparing -> rendering -> encoding). */
  enter(phase: 'rendering' | 'encoding'): void;
  /** Báo khung render xong; `skipped` = khung đã có sẵn trên đĩa (resume), không tính vào ước lượng tốc độ. */
  progress(p: { frame: number; skipped?: boolean }): void;
  encodeProgress(encodedFrames: number): void;
  setDevice(info: string): void;
  setWorkDir(dir: string): void;
}

export interface JobRunner {
  run(job: JobRecord, ctl: RunControl): Promise<{ outputPath: string }>;
  cleanup?(job: JobRecord): Promise<void> | void;
  /** Dọn tài nguyên mồ côi của một job bị gián đoạn trước khi chạy lại. */
  reclaim?(job: JobRecord): Promise<void> | void;
}

export interface QueueOptions {
  store: JobStore;
  runner: JobRunner;
  now?: () => number;
  onChange?: (job: JobRecord) => void;
  emitThrottleMs?: number;
}

interface Running {
  id: string;
  abort: AbortController;
  settled: Promise<void>;
}

export class JobQueue {
  private readonly store: JobStore;
  private readonly runner: JobRunner;
  private readonly now: () => number;
  private readonly onChange: (job: JobRecord) => void;
  private readonly throttle: number;
  private running: Running | null = null;
  private lastEmit = 0;
  private shuttingDown = false;

  constructor(opts: QueueOptions) {
    this.store = opts.store;
    this.runner = opts.runner;
    this.now = opts.now ?? Date.now;
    this.onChange = opts.onChange ?? (() => {});
    this.throttle = opts.emitThrottleMs ?? 100;
  }

  list(): JobRecord[] {
    return this.store.list();
  }

  get(id: string): JobRecord | null {
    return this.store.get(id);
  }

  enqueue(input: RenderRequestInput | RenderRequest): JobRecord {
    const request = RenderRequest.parse(input);
    const job = this.store.insert(request);
    this.emit(job, true);
    this.pump();
    return job;
  }

  /** Gọi một lần khi khởi động: job đang dở do app bị đóng/crash quay lại hàng đợi và tiếp tục từ khung đã có. */
  async recover(): Promise<JobRecord[]> {
    const recovered: JobRecord[] = [];
    for (const job of this.store.listByStatus('preparing', 'rendering', 'encoding')) {
      await this.runner.reclaim?.(job);
      const next = this.store.update(job.id, { status: transition(job.status, 'recover') });
      recovered.push(next);
      this.emit(next, true);
    }
    this.pump();
    return recovered;
  }

  /** Thoát êm: dừng job đang chạy nhưng GIỮ trạng thái dở dang để lần mở sau `recover()` chạy tiếp từ khung đã có. */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.running) {
      this.running.abort.abort();
      await this.running.settled;
    }
  }

  async cancel(id: string): Promise<boolean> {
    const job = this.store.get(id);
    if (!job) return false;
    if (job.status === 'queued') {
      const next = this.store.update(id, { status: transition('queued', 'cancel'), finishedAt: this.now() });
      this.emit(next, true);
      return true;
    }
    if (this.running?.id === id) {
      this.running.abort.abort();
      await this.running.settled;
      return true;
    }
    return false;
  }

  retry(id: string): boolean {
    const job = this.store.get(id);
    if (!job || (job.status !== 'failed' && job.status !== 'canceled')) return false;
    const next = this.store.update(id, {
      status: transition(job.status, 'retry'),
      errorCode: null,
      errorMessage: null,
      finishedAt: null,
    });
    this.emit(next, true);
    this.pump();
    return true;
  }

  async remove(id: string): Promise<boolean> {
    const job = this.store.get(id);
    if (!job) return false;
    if (job.status === 'preparing' || job.status === 'rendering' || job.status === 'encoding') return false;
    this.store.delete(id);
    await this.runner.cleanup?.(job);
    return true;
  }

  /** Chờ job đang chạy kết thúc và hàng đợi cạn (dùng trong test/CLI). */
  async idle(): Promise<void> {
    for (;;) {
      const current = this.running;
      if (!current) {
        if (!this.store.nextRunnable()) return;
        this.pump();
        continue;
      }
      await current.settled;
    }
  }

  private pump(): void {
    if (this.running || this.shuttingDown) return;
    const next = this.store.nextRunnable();
    if (!next) return;
    this.start(next);
  }

  private start(job: JobRecord): void {
    const abort = new AbortController();
    const preparing = this.store.update(job.id, {
      status: transition(job.status, 'start'),
      attempts: job.attempts + 1,
      startedAt: job.startedAt ?? this.now(),
      finishedAt: null,
      errorCode: null,
      errorMessage: null,
    });
    this.emit(preparing, true);

    const settled = this.execute(preparing, abort).finally(() => {
      this.running = null;
      queueMicrotask(() => this.pump());
    });
    this.running = { id: job.id, abort, settled };
  }

  private async execute(job: JobRecord, abort: AbortController): Promise<void> {
    const id = job.id;
    let renderStartedAt = 0;
    let renderedFrames = 0;
    const apply = (patch: Parameters<JobStore['update']>[1], force = false) => {
      const next = this.store.update(id, patch);
      this.emit(next, force);
      return next;
    };
    const current = () => this.store.mustGet(id);

    const ctl: RunControl = {
      signal: abort.signal,
      enter: (phase) => {
        const cur = current();
        if (phase === 'rendering' && cur.status === 'preparing') {
          renderStartedAt = this.now();
          apply({ status: transition(cur.status, 'render_started') }, true);
        } else if (phase === 'encoding' && cur.status === 'rendering') {
          apply({ status: transition(cur.status, 'encode_started'), progress: overallProgress('encoding', cur.totalFrames, cur.totalFrames, 0) }, true);
        }
      },
      progress: ({ frame, skipped }) => {
        const cur = current();
        if (!skipped) renderedFrames++;
        const elapsed = (this.now() - renderStartedAt) / 1000;
        apply({
          frame,
          progress: overallProgress('rendering', frame, cur.totalFrames),
          estimateS: skipped ? cur.estimateS : estimateRemainingSeconds(elapsed, renderedFrames, cur.totalFrames - frame + renderedFrames),
        });
      },
      encodeProgress: (encoded) => {
        const cur = current();
        apply({ progress: overallProgress('encoding', cur.totalFrames, cur.totalFrames, encoded), estimateS: null });
      },
      setDevice: (info) => apply({ deviceInfo: info }, true),
      setWorkDir: (dir) => apply({ workDir: dir }),
    };

    try {
      const result = await this.runner.run(job, ctl);
      if (abort.signal.aborted) throw new AppError('CANCELED', 'canceled');
      const cur = current();
      apply({
        status: transition(cur.status, 'finish'),
        progress: 1,
        frame: cur.totalFrames,
        estimateS: null,
        outputPath: result.outputPath,
        finishedAt: this.now(),
      }, true);
    } catch (err) {
      const cur = this.store.get(id);
      if (!cur) return;
      if (this.shuttingDown) return;
      if (abort.signal.aborted) {
        apply({ status: transition(cur.status, 'cancel'), estimateS: null, finishedAt: this.now() }, true);
        return;
      }
      const appErr = err instanceof AppError ? err : null;
      apply({
        status: transition(cur.status, 'fail'),
        estimateS: null,
        errorCode: appErr?.code ?? 'UNKNOWN',
        errorMessage: err instanceof Error ? err.message : String(err),
        finishedAt: this.now(),
      }, true);
    }
  }

  private emit(job: JobRecord, force: boolean): void {
    const t = this.now();
    if (!force && t - this.lastEmit < this.throttle) return;
    this.lastEmit = t;
    this.onChange(job);
  }
}
