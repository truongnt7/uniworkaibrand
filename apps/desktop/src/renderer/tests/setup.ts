import { afterEach } from 'vitest';

// Chỉ nạp công cụ DOM khi môi trường test có `document` (jsdom); test orchestrator chạy trên Node thuần.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => cleanup());
}
