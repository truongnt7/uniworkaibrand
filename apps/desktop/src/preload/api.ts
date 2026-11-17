import type { EventChannelName, InvokeChannelName } from '@aps/shared/channels';

/** Bề mặt API duy nhất mà renderer thấy (window.aps). Kiểu cụ thể nằm ở renderer/src/api.ts. */
export interface ApsBridge {
  invoke(channel: InvokeChannelName, payload?: unknown): Promise<unknown>;
  on(channel: EventChannelName, listener: (payload: unknown) => void): () => void;
  /** Đường dẫn thật của tệp người dùng kéo thả vào cửa sổ (renderer sandbox không đọc được `File.path`). Chuỗi rỗng nếu không xác định. */
  pathForFile(file: File): string;
}
