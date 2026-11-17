import { writeFileSync } from 'node:fs';
import { loadDotEnv } from './env-file';
import { loadEnv } from '../config/env';
import { buildOpenApi, createApp } from '../bootstrap';

/** Xuất openapi.json (cần DB/S3 truy cập được vì app được khởi tạo đầy đủ). */
async function main() {
  loadDotEnv();
  const app = await createApp({ ...loadEnv(), RATE_LIMIT_ENABLED: false });
  await app.init();
  const out = process.argv[2] ?? 'openapi.json';
  writeFileSync(out, JSON.stringify(buildOpenApi(app), null, 2) + '\n');
  console.log(`Đã ghi ${out}`);
  await app.close();
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
