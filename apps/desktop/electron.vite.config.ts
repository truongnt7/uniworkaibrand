import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Gói workspace là mã TypeScript nguồn nên phải được bundle vào main/preload/orchestrator.
const bundled = ['@aps/shared', '@aps/i18n', '@aps/render-core'];

// `electron-vite build` (mode production) đặt hằng này = false: mã nạp khóa DEV bị loại khỏi bản phát hành.
const devKeyAllowed = (mode: string) => JSON.stringify(mode !== 'production');

export default defineConfig(({ mode }) => ({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
    define: { __APS_ALLOW_DEV_KEY__: devKeyAllowed(mode) },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          orchestrator: resolve(__dirname, 'src/orchestrator/entry.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
    define: { __APS_ALLOW_DEV_KEY__: devKeyAllowed(mode) },
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
}));
