import type { EventChannelName, InvokeChannelName } from '@aps/shared/channels';

/** Bề mặt API duy nhất mà renderer thấy (window.aps). Kiểu cụ thể nằm ở renderer/src/api.ts. */
export interface ApsBridge {
  invoke(channel: InvokeChannelName, payload?: unknown): Promise<unknown>;
  on(channel: EventChannelName, listener: (payload: unknown) => void): () => void;
}
