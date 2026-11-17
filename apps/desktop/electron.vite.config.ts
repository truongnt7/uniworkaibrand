import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Gói workspace là mã TypeScript nguồn nên phải được bundle vào main/preload/orchestrator.
const bundled = ['@aps/shared', '@aps/i18n', '@aps/render-core'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: bundled })],
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
    build: { rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
});
