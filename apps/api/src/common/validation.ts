import { ValidationError, ValidationPipe } from '@nestjs/common';
import { AppException } from './app-exception';
import { Locale, translateValidation } from '../i18n/messages';

export interface FieldIssue {
  field: string;
  constraint: string;
}

export function flattenValidationErrors(errors: ValidationError[], parent = ''): FieldIssue[] {
  const out: FieldIssue[] = [];
  for (const e of errors) {
    const path = parent ? `${parent}.${e.property}` : e.property;
    for (const constraint of Object.keys(e.constraints ?? {})) out.push({ field: path, constraint });
    if (e.children?.length) out.push(...flattenValidationErrors(e.children, path));
  }
  return out;
}

/** `details` giữ mã ràng buộc (ổn định) kèm thông điệp vi/en để client chọn dịch hoặc hiển thị luôn. */
export function issuesToDetails(issues: FieldIssue[]) {
  return issues.map((i) => ({
    field: i.field,
    constraint: i.constraint,
    message: { vi: translateValidation('vi' as Locale, i.constraint, i.field), en: translateValidation('en' as Locale, i.constraint, i.field) },
  }));
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
    exceptionFactory: (errors) => new AppException('VALIDATION_FAILED', 400, {}, issuesToDetails(flattenValidationErrors(errors))),
  });
}
