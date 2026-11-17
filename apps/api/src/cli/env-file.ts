import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Nạp apps/api/.env (nếu có) mà không ghi đè biến đã đặt sẵn. */
export function loadDotEnv(): void {
  const file = resolve(__dirname, '..', '..', '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}
