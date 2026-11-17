import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from './app-exception';
import { DEFAULT_LOCALE, Locale, resolveLocale, translateError } from '../i18n/messages';

export interface ErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

const STATUS_CODES: Record<number, string> = {
  400: 'VALIDATION_FAILED',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
};

export function localeOf(req: Request, fallback: Locale = DEFAULT_LOCALE): Locale {
  return resolveLocale(req.headers['accept-language'], fallback);
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  constructor(private readonly defaultLocale: Locale = DEFAULT_LOCALE) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const locale = localeOf(req, this.defaultLocale);

    let body: ErrorBody;
    if (exception instanceof AppException) {
      body = {
        statusCode: exception.getStatus(),
        code: exception.code,
        message: translateError(locale, exception.code, exception.params),
        ...(exception.details !== undefined ? { details: exception.details } : {}),
      };
    } else if (exception instanceof ThrottlerException) {
      body = { statusCode: 429, code: 'RATE_LIMITED', message: translateError(locale, 'RATE_LIMITED') };
    } else if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_CODES[status] ?? 'UNKNOWN';
      body = { statusCode: status, code, message: translateError(locale, code) };
    } else {
      this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
      body = { statusCode: 500, code: 'INTERNAL_ERROR', message: translateError(locale, 'INTERNAL_ERROR') };
    }
    res.status(body.statusCode).json(body);
  }
}
