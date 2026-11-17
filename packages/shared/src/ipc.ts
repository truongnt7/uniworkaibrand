import { z } from 'zod';
import { JobRecord, RenderRequest } from './job.js';
import { RuntimeProgress, RuntimeStatus } from './runtime.js';

const Empty = z.object({}).strict();
const IdPayload = z.object({ id: z.string().min(1) });

/** Hợp đồng IPC duy nhất giữa renderer <-> main <-> orchestrator (schema zod dùng chung). */
export const invokeContract = {
  'jobs:list': { req: Empty, res: z.array(JobRecord) },
  'jobs:create': { req: RenderRequest, res: JobRecord },
  'jobs:cancel': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'jobs:retry': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'jobs:remove': { req: IdPayload, res: z.object({ ok: z.boolean() }) },
  'runtime:status': { req: Empty, res: RuntimeStatus },
  'runtime:install': { req: Empty, res: RuntimeStatus },
  'runtime:importFile': { req: z.object({ path: z.string().min(1) }), res: RuntimeStatus },
  'dialog:pickFile': {
    req: z.object({ kind: z.enum(['glb', 'image', 'runtime']) }),
    res: z.object({ path: z.string().nullable() }),
  },
  'app:info': {
    req: Empty,
    res: z.object({ version: z.string(), platform: z.string(), dataDir: z.string() }),
  },
} as const;

export const eventContract = {
  'jobs:changed': JobRecord,
  'runtime:progress': RuntimeProgress,
} as const;

export type InvokeChannel = keyof typeof invokeContract;
export type EventChannel = keyof typeof eventContract;
export type InvokeReq<C extends InvokeChannel> = z.input<(typeof invokeContract)[C]['req']>;
export type InvokeRes<C extends InvokeChannel> = z.infer<(typeof invokeContract)[C]['res']>;
export type EventPayload<C extends EventChannel> = z.infer<(typeof eventContract)[C]>;

export const INVOKE_CHANNELS = Object.keys(invokeContract) as InvokeChannel[];
export const EVENT_CHANNELS = Object.keys(eventContract) as EventChannel[];

export class IpcValidationError extends Error {
  readonly code = 'IPC_INVALID_PAYLOAD';
  constructor(
    readonly channel: string,
    detail: string,
  ) {
    super(`IPC ${channel}: ${detail}`);
  }
}

export type InvokeHandlers = {
  [C in InvokeChannel]?: (req: z.output<(typeof invokeContract)[C]['req']>) => Promise<InvokeRes<C>> | InvokeRes<C>;
};

/**
 * Kiểm tra kênh + schema rồi gọi handler. Dùng ở main (và orchestrator) cho mọi yêu cầu từ renderer.
 * Kênh lạ hoặc payload sai schema bị từ chối trước khi chạm vào logic.
 */
export async function dispatchInvoke(handlers: InvokeHandlers, channel: unknown, payload: unknown): Promise<unknown> {
  if (typeof channel !== 'string' || !Object.hasOwn(invokeContract, channel)) {
    throw new IpcValidationError(String(channel), 'unknown channel');
  }
  const ch = channel as InvokeChannel;
  const parsed = invokeContract[ch].req.safeParse(payload ?? {});
  if (!parsed.success) {
    throw new IpcValidationError(ch, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
  }
  const handler = handlers[ch] as ((req: unknown) => unknown) | undefined;
  if (!handler) throw new IpcValidationError(ch, 'no handler');
  return handler(parsed.data);
}
