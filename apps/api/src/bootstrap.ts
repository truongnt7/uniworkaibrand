import 'reflect-metadata';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { Env } from './config/env';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { createValidationPipe } from './common/validation';

export function buildOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('AI Product Studio API')
    .setDescription(
      'Backend MVP: auth, workspace, product/asset (presigned S3), template, library, runtime manifest đã ký, admin cấp gói/credit thủ công.\n\n' +
        'Lỗi trả về dạng `{ statusCode, code, message, details? }`; `message` theo header `Accept-Language` (vi mặc định, en).',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}

export async function createApp(env: Env): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), {
    logger: env.APS_ENV === 'test' ? ['error', 'warn'] : ['log', 'error', 'warn'],
    abortOnError: false,
  });
  app.disable('x-powered-by');
  const hops = Number(process.env.TRUST_PROXY ?? 0);
  if (hops > 0) app.set('trust proxy', hops);
  app.use(helmet());
  const origins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins, credentials: false, maxAge: 600 });
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter(env.DEFAULT_LOCALE));
  app.enableShutdownHooks();
  if (env.swaggerEnabled) {
    SwaggerModule.setup('docs', app, buildOpenApi(app), { jsonDocumentUrl: 'docs-json' });
  }
  return app;
}
