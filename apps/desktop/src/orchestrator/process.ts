import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { once } from 'node:events';

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  onStdoutChunk?: (chunk: Buffer) => void;
  onStderrChunk?: (chunk: Buffer) => void;
  /** Thời gian chờ thoát êm (SIGTERM) trước khi SIGKILL cả cây tiến trình. */
  killGraceMs?: number;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string;
  aborted: boolean;
}

const isWindows = process.platform === 'win32';

/** Kết thúc cả cây tiến trình (Blender có thể sinh tiến trình con). Không dùng shell. */
export function killTree(child: ChildProcess, signal: NodeJS.Signals = 'SIGKILL'): void {
  const pid = child.pid;
  if (!pid) return;
  try {
    if (isWindows) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } else {
      process.kill(-pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // đã thoát
    }
  }
}

/** Chạy tiến trình bằng mảng đối số (không shell); huỷ qua AbortSignal sẽ giết cả cây. */
export async function runProcess(command: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const spawnOpts: SpawnOptions = {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: !isWindows,
    windowsHide: true,
  };
  const child = spawn(command, args, spawnOpts);
  let aborted = false;
  let stderrTail = '';
  let killTimer: NodeJS.Timeout | undefined;

  child.stdout?.on('data', (c: Buffer) => opts.onStdoutChunk?.(c));
  child.stderr?.on('data', (c: Buffer) => {
    stderrTail = (stderrTail + c.toString('utf8')).slice(-4000);
    opts.onStderrChunk?.(c);
  });

  const onAbort = () => {
    aborted = true;
    killTree(child, 'SIGTERM');
    killTimer = setTimeout(() => killTree(child, 'SIGKILL'), opts.killGraceMs ?? 800);
  };
  if (opts.signal) {
    if (opts.signal.aborted) onAbort();
    else opts.signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    const [code, signal] = (await Promise.race([
      once(child, 'close'),
      once(child, 'error').then(([e]) => {
        throw e;
      }),
    ])) as [number | null, NodeJS.Signals | null];
    return { code, signal, stderrTail, aborted };
  } finally {
    clearTimeout(killTimer);
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
