import 'reflect-metadata';
import { Client } from 'pg';
import { createDataSource } from '../../src/database/data-source';
import { adminDatabaseUrl, TEST_DB_NAME, testDatabaseUrl } from './test-env';

/** Tạo lại CSDL test sạch và chạy toàn bộ migration từ đầu (kiểm luôn migration). */
export default async function setup() {
  const admin = new Client({ connectionString: adminDatabaseUrl() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME} WITH (FORCE)`);
    await admin.query(`CREATE DATABASE ${TEST_DB_NAME}`);
  } finally {
    await admin.end();
  }
  const ds = createDataSource(testDatabaseUrl());
  await ds.initialize();
  try {
    await ds.runMigrations({ transaction: 'each' });
  } finally {
    await ds.destroy();
  }
}
