import { HttpException } from '@nestjs/common';

/** Lỗi nghiệp vụ có mã ổn định; client dịch theo `code`, server còn trả sẵn `message` theo Accept-Language. */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    status: number,
    readonly params: Record<string, string | number> = {},
    readonly details?: unknown,
  ) {
    super({ code, params }, status);
  }
}

export const notFound = (code: string, params?: Record<string, string | number>) => new AppException(code, 404, params);
export const conflict = (code: string, params?: Record<string, string | number>) => new AppException(code, 409, params);
export const forbidden = (code = 'FORBIDDEN') => new AppException(code, 403);
export const badRequest = (code: string, params?: Record<string, string | number>, details?: unknown) =>
  new AppException(code, 400, params, details);
