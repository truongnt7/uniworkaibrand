import 'reflect-metadata';
import { loadDotEnv } from './env-file';
import { createDataSource } from '../database/data-source';

/** Dùng khi phát triển: in SQL chênh lệch giữa entity và CSDL hiện tại (để viết migration mới). */
async function main() {
  loadDotEnv();
  const ds = createDataSource(process.env.DATABASE_URL ?? '', false);
  await ds.initialize();
  const sql = await ds.driver.createSchemaBuilder().log();
  console.log('-- up');
  for (const q of sql.upQueries) console.log(q.query + ';');
  console.log('-- down');
  for (const q of sql.downQueries) console.log(q.query + ';');
  await ds.destroy();
}
main().catch((e) => { console.error(e); process.exit(1); });
