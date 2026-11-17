import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

const swcPlugin = swc.vite({
  jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2022' },
  module: { type: 'es6' },
});

// E2E chạy thật với PostgreSQL + MinIO (docker compose up). Các file test dùng chung một CSDL nên chạy tuần tự.
export default defineConfig({
  plugins: [swcPlugin],
  test: {
    include: ['tests/e2e/**/*.e2e.test.ts'],
    globalSetup: ['tests/e2e/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
