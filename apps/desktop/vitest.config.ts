import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Test component renderer dùng docblock `@vitest-environment jsdom`; test orchestrator vẫn chạy trên Node.
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['tests/**/*.test.ts', 'src/renderer/tests/**/*.test.{ts,tsx}'],
    setupFiles: ['src/renderer/tests/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
