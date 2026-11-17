import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule } from './config/config.module';
import { ENV, Env } from './config/env';
import { buildDataSourceOptions } from './database/data-source';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './auth/auth.module';
import { WorkspacesModule } from './workspaces/workspaces.module';
import { CatalogModule } from './products/catalog.module';
import { TemplatesModule } from './templates/templates.module';
import { ContentsModule } from './contents/contents.module';
import { RuntimeModule } from './runtime/runtime.module';
import { BillingModule } from './billing/billing.module';
import { AdminModule } from './admin/admin.module';
import { HealthController } from './health/health.controller';

@Module({})
export class AppModule {
  static register(env: Env): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(env),
        TypeOrmModule.forRootAsync({
          inject: [ENV],
          useFactory: (e: Env) => ({ ...buildDataSourceOptions(e.DATABASE_URL, e.DB_LOGGING), migrationsRun: e.DB_MIGRATIONS_RUN }),
        }),
        ThrottlerModule.forRootAsync({
          inject: [ENV],
          useFactory: (e: Env) => ({
            // Bộ nhớ trong tiến trình: đủ cho một instance; chuyển sang Redis storage khi scale ngang.
            throttlers: [{ name: 'default', ttl: 60_000, limit: 300 }],
            skipIf: () => !e.RATE_LIMIT_ENABLED,
          }),
        }),
        StorageModule,
        AuthModule,
        WorkspacesModule,
        CatalogModule,
        TemplatesModule,
        ContentsModule,
        RuntimeModule,
        BillingModule,
        AdminModule,
      ],
      controllers: [HealthController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    };
  }
}
