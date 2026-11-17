import type { MigrationInterface } from 'typeorm';
import { InitSchema1763000000000 } from './1763000000000-init-schema';

export const MIGRATIONS: Array<new () => MigrationInterface> = [InitSchema1763000000000];
