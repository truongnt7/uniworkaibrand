import { parentPort, workerData } from 'node:worker_threads';
import { convertHeicFile } from './heic.js';

/** Luồng riêng (worker_threads) để giải mã HEIC nặng CPU không làm đứng hàng đợi/IPC của orchestrator. */
interface Job {
  src: string;
  dest: string;
}

const job = workerData as Job;
convertHeicFile(job.src, job.dest)
  .then((r) => parentPort?.postMessage({ ok: true, ...r }))
  .catch((e: unknown) =>
    parentPort?.postMessage({ ok: false, code: (e as { code?: string }).code ?? 'PHOTO_HEIC_FAILED', message: e instanceof Error ? e.message : String(e) }),
  );
