import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC để phát metadata decorator (NestJS DI cần `emitDecoratorMetadata`, esbuild không có).
const swcPlugin = swc.vite({
  jsc: { parser: { syntax: 'typescript', decorators: true }, transform: { legacyDecorator: true, decoratorMetadata: true }, target: 'es2022' },
  module: { type: 'es6' },
});

export default defineConfig({
  plugins: [swcPlugin],
  test: { include: ['tests/unit/**/*.test.ts'], testTimeout: 20_000 },
});
