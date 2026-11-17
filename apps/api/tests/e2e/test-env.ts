import { generateKeyPairSync } from 'node:crypto';
import { loadEnv, type Env } from '../../src/config/env';

export const TEST_DB_NAME = process.env.TEST_DB_NAME ?? 'aps_test';
const adminUrl = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://aps:aps@localhost:5432/postgres';

export const testDatabaseUrl = () => {
  const u = new URL(adminUrl);
  u.pathname = `/${TEST_DB_NAME}`;
  return u.toString();
};
export const adminDatabaseUrl = () => adminUrl;

export const testKeys = (() => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    privatePem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
})();

export function testEnv(overrides: Record<string, string> = {}): Env {
  return loadEnv({
    APS_ENV: 'test',
    DATABASE_URL: testDatabaseUrl(),
    S3_ENDPOINT: process.env.TEST_S3_ENDPOINT ?? 'http://localhost:9000',
    S3_ACCESS_KEY: process.env.TEST_S3_ACCESS_KEY ?? 'minioadmin',
    S3_SECRET_KEY: process.env.TEST_S3_SECRET_KEY ?? 'minioadmin',
    S3_BUCKET: 'aps-test',
    S3_AUTO_CREATE_BUCKET: 'true',
    JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-0123456789',
    RATE_LIMIT_ENABLED: 'false',
    MANIFEST_SIGNING_KEY: testKeys.privatePem,
    MANIFEST_KEY_ID: 'dev-test-1',
    ...overrides,
  } as NodeJS.ProcessEnv);
}
