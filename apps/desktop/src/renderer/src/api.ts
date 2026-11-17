import type {
  EventChannel,
  EventPayload,
  InvokeChannel,
  InvokeReq,
  InvokeRes,
} from '@aps/shared';
import { eventContract, invokeContract } from '@aps/shared';
import type { ApsBridge } from '../../preload/api';

declare global {
  interface Window {
    aps: ApsBridge;
  }
}

/** Gọi IPC có kiểu; kết quả được kiểm lại bằng schema dùng chung. */
export async function invoke<C extends InvokeChannel>(channel: C, payload?: InvokeReq<C>): Promise<InvokeRes<C>> {
  const raw = await window.aps.invoke(channel, payload ?? {});
  return invokeContract[channel].res.parse(raw) as InvokeRes<C>;
}

export function subscribe<C extends EventChannel>(channel: C, listener: (payload: EventPayload<C>) => void): () => void {
  return window.aps.on(channel, (raw) => listener(eventContract[channel].parse(raw) as EventPayload<C>));
}
