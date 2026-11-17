import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { RuntimeModule } from '../runtime/runtime.module';
import { TemplatesModule } from '../templates/templates.module';
import { AdminController } from './admin.controller';

@Module({ imports: [BillingModule, TemplatesModule, RuntimeModule], controllers: [AdminController] })
export class AdminModule {}
