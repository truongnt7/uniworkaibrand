import { Logger } from '@nestjs/common';
import { loadDotEnv } from './cli/env-file';
import { loadEnv } from './config/env';
import { createApp } from './bootstrap';

async function main() {
  loadDotEnv();
  const env = loadEnv();
  const app = await createApp(env);
  await app.listen(env.PORT, '0.0.0.0');
  new Logger('Bootstrap').log(`API chạy tại http://localhost:${env.PORT} (${env.APS_ENV}); Swagger: ${env.swaggerEnabled ? '/docs' : 'tắt'}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
