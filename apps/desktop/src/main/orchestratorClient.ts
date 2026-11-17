import { utilityProcess, type UtilityProcess } from 'electron';
import { AppError, type EventChannel, type EventPayload } from '@aps/shared';

type Pending = { resolve: (v: unknown) => void; reject: (e: unknown) => void };

/** Cầu nối request/response + event stream tới orchestrator (utilityProcess). */
export class OrchestratorClient {
  private child: UtilityProcess | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private ready: Promise<void> = Promise.resolve();
  private shutdownResolve: (() => void) | null = null;

  constructor(
    private readonly entry: string,
    private readonly config: unknown,
    private readonly onEvent: <C extends EventChannel>(channel: C, payload: EventPayload<C>) => void,
  ) {}

  start(): void {
    const child = utilityProcess.fork(this.entry, [], {
      serviceName: 'aps-orchestrator',
      stdio: 'inherit',
      env: { ...process.env, APS_ORCHESTRATOR_CONFIG: JSON.stringify(this.config) },
    });
    this.child = child;
    this.ready = new Promise<void>((resolve) => {
      child.on('message', (msg: { kind: string; [k: string]: unknown }) => {
        if (msg.kind === 'ready') return resolve();
        if (msg.kind === 'shutdown-done') return this.shutdownResolve?.();
        if (msg.kind === 'event') {
          this.onEvent(msg.channel as EventChannel, msg.payload as never);
        } else if (msg.kind === 'result') {
          const p = this.pending.get(msg.id as number);
          if (!p) return;
          this.pending.delete(msg.id as number);
          if (msg.ok) p.resolve(msg.result);
          else {
            const e = msg.error as { code: string; message: string };
            p.reject(new AppError(e.code, e.message));
          }
        }
      });
    });
    child.on('exit', (code) => {
      for (const p of this.pending.values()) p.reject(new AppError('ORCHESTRATOR_EXIT', `orchestrator thoát với mã ${code}`));
      this.pending.clear();
      this.child = null;
    });
  }

  async invoke(channel: string, payload: unknown): Promise<unknown> {
    await this.ready;
    const child = this.child;
    if (!child) throw new AppError('ORCHESTRATOR_EXIT', 'orchestrator không chạy');
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      child.postMessage({ kind: 'invoke', id, channel, payload });
    });
  }

  /** Yêu cầu orchestrator dừng êm (kill Blender, giữ job dở dang), tối đa `timeoutMs`, rồi kill tiến trình. */
  async stop(timeoutMs = 5000): Promise<void> {
    const child = this.child;
    if (!child) return;
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, timeoutMs);
      this.shutdownResolve = () => {
        clearTimeout(t);
        resolve();
      };
      child.postMessage({ kind: 'shutdown' });
    });
    child.kill();
  }
}
