import { invoke, subscribe } from '../api';
import type { QueueBridge } from './export';

/** Cầu nối thật tới IPC của PoC (jobs:create, runtime:status, dialog:pickFile, jobs:changed). */
export function createIpcQueueBridge(): QueueBridge {
  return {
    runtimeInstalled: async () => (await invoke('runtime:status')).installed,
    pickModelFile: async () => (await invoke('dialog:pickFile', { kind: 'glb' })).path,
    createJob: async (request) => {
      const job = await invoke('jobs:create', request);
      return { id: job.id };
    },
    onJobChanged: (listener) => subscribe('jobs:changed', (job) => listener({ id: job.id, status: job.status, progress: job.progress })),
  };
}

export function hasIpcBridge(): boolean {
  return typeof window !== 'undefined' && typeof (window as { aps?: unknown }).aps === 'object' && (window as { aps?: unknown }).aps !== null;
}
