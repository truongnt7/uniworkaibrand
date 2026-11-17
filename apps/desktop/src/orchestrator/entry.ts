/**
 * Điểm vào của utilityProcess "orchestrator": nhận yêu cầu IPC đã được main kiểm tra,
 * chạy hàng đợi/SQLite/spawn Blender ngoài main và renderer.
 */
import { AppError, IpcValidationError, dispatchInvoke } from '@aps/shared';
import { createOrchestrator, type OrchestratorConfig } from './orchestrator.js';

interface ParentPort {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

const parentPort = (process as unknown as { parentPort?: ParentPort }).parentPort;
if (!parentPort) throw new Error('orchestrator phải chạy trong utilityProcess');

const config = JSON.parse(process.env.APS_ORCHESTRATOR_CONFIG ?? '{}') as OrchestratorConfig;

const orchestrator = createOrchestrator(config, (channel, payload) => {
  parentPort.postMessage({ kind: 'event', channel, payload });
});

parentPort.on('message', async ({ data }) => {
  const msg = data as { kind?: string; id?: number; channel?: string; payload?: unknown };
  if (msg.kind !== 'invoke' || typeof msg.id !== 'number') return;
  try {
    const result = await dispatchInvoke(orchestrator.handlers, msg.channel, msg.payload);
    parentPort.postMessage({ kind: 'result', id: msg.id, ok: true, result });
  } catch (err) {
    const code = err instanceof AppError || err instanceof IpcValidationError ? err.code : 'UNKNOWN';
    parentPort.postMessage({
      kind: 'result',
      id: msg.id,
      ok: false,
      error: { code, message: err instanceof Error ? err.message : String(err) },
    });
  }
});

parentPort.postMessage({ kind: 'ready' });
