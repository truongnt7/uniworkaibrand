/** Lỗi có mã ổn định; UI dịch theo `errors.<code>` trong packages/i18n. */
export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const IPC_ERROR_TAG = 'APS_ERR';

/** Electron chỉ chuyển `message` của lỗi từ main sang renderer; gói mã lỗi vào message để renderer lấy lại được. */
export function encodeIpcError(code: string, message: string): string {
  return `${IPC_ERROR_TAG}|${code}|${message}`;
}

/** Ngược lại với `encodeIpcError` (chịu được tiền tố "Error invoking remote method '...': Error: " do Electron thêm vào). */
export function decodeIpcError(message: string): AppError | null {
  const m = new RegExp(`${IPC_ERROR_TAG}\\|([A-Z][A-Z0-9_]{1,63})\\|([\\s\\S]*)$`).exec(message);
  return m ? new AppError(m[1] as string, m[2] as string) : null;
}
