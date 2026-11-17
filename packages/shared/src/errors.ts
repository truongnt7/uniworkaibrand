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
