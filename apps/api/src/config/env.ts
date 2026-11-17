import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  APS_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(0).max(65535).default(3000),
  CORS_ORIGINS: z.string().default(''),
  SWAGGER_ENABLED: bool.optional(),
  RATE_LIMIT_ENABLED: bool.default(true),
  DEFAULT_LOCALE: z.enum(['vi', 'en']).default('vi'),

  DATABASE_URL: z.string().min(1),
  DB_MIGRATIONS_RUN: bool.default(false),
  DB_LOGGING: bool.default(false),

  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_FORCE_PATH_STYLE: bool.default(true),
  S3_AUTO_CREATE_BUCKET: bool.default(false),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET phải dài ≥ 32 ký tự'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).default(900),
  REFRESH_TTL_SECONDS: z.coerce.number().int().min(300).default(60 * 60 * 24 * 30),

  MANIFEST_SIGNING_KEY: z.string().optional(),
  MANIFEST_KEY_ID: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & { isProduction: boolean; swaggerEnabled: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Cấu hình môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  const env = parsed.data;
  const isProduction = env.APS_ENV === 'production';
  if (isProduction && env.JWT_ACCESS_SECRET.toLowerCase().includes('change-me')) {
    throw new Error('Cấu hình môi trường không hợp lệ: JWT_ACCESS_SECRET vẫn là giá trị mẫu trong production');
  }
  return { ...env, isProduction, swaggerEnabled: env.SWAGGER_ENABLED ?? !isProduction };
}

export const ENV = Symbol('APS_ENV');
