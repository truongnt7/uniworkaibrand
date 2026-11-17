import { DataSource, DataSourceOptions } from 'typeorm';
import { ENTITIES } from './entities';
import { SnakeNamingStrategy } from './naming';
import { MIGRATIONS } from './migrations';

export function buildDataSourceOptions(databaseUrl: string, logging = false): DataSourceOptions {
  return {
    type: 'postgres',
    url: databaseUrl,
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'typeorm_migrations',
    namingStrategy: new SnakeNamingStrategy(),
    uuidExtension: 'pgcrypto',
    synchronize: false,
    logging,
  };
}

export function createDataSource(databaseUrl: string, logging = false): DataSource {
  return new DataSource(buildDataSourceOptions(databaseUrl, logging));
}
