import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StorageService } from '../storage/storage.service';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async check() {
    const db = await this.ds.query('SELECT 1').then(() => true, () => false);
    const storage = await this.storage.ping();
    if (!db || !storage) throw new ServiceUnavailableException({ status: 'degraded', db, storage });
    return { status: 'ok', db, storage };
  }
}
