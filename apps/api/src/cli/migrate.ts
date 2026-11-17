import 'reflect-metadata';
import { loadDotEnv } from './env-file';
import { createDataSource } from '../database/data-source';

async function main() {
  loadDotEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Thiếu DATABASE_URL');
  const ds = createDataSource(url, false);
  await ds.initialize();
  try {
    const cmd = process.argv[2] ?? 'run';
    if (cmd === 'run') {
      const done = await ds.runMigrations({ transaction: 'each' });
      console.log(done.length ? `Đã chạy: ${done.map((m) => m.name).join(', ')}` : 'Không có migration mới.');
    } else if (cmd === 'revert') {
      await ds.undoLastMigration({ transaction: 'each' });
      console.log('Đã hoàn tác migration gần nhất.');
    } else if (cmd === 'status') {
      const pending = await ds.showMigrations();
      console.log(pending ? 'Còn migration chưa chạy.' : 'CSDL đã ở phiên bản mới nhất.');
    } else {
      throw new Error(`Lệnh không hỗ trợ: ${cmd} (run | revert | status)`);
    }
  } finally {
    await ds.destroy();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
