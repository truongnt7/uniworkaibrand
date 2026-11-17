import 'reflect-metadata';
import { hash } from '@node-rs/argon2';
import { loadDotEnv } from './env-file';
import { createDataSource } from '../database/data-source';
import { UserEntity } from '../database/entities';

/** Usage: ADMIN_PASSWORD=... pnpm --filter @aps/api admin:create <email> [displayName]. Mật khẩu chỉ qua biến môi trường, không qua argv. */
async function main() {
  loadDotEnv();
  const [emailRaw, displayName = 'Platform Admin'] = process.argv.slice(2);
  const password = process.env.ADMIN_PASSWORD;
  if (!emailRaw || !password) throw new Error('Dùng: ADMIN_PASSWORD=... admin:create <email> [displayName]');
  if (password.length < 12) throw new Error('ADMIN_PASSWORD phải dài ≥ 12 ký tự');
  const email = emailRaw.toLowerCase();
  const ds = createDataSource(process.env.DATABASE_URL ?? '');
  await ds.initialize();
  try {
    const repo = ds.getRepository(UserEntity);
    const existing = await repo.findOne({ where: { email } });
    const passwordHash = await hash(password);
    if (existing) {
      await repo.update({ id: existing.id }, { isPlatformAdmin: true, passwordHash });
      console.log(`Đã cấp quyền platform admin và đặt lại mật khẩu cho ${email}`);
    } else {
      await repo.save(repo.create({ email, passwordHash, displayName, isPlatformAdmin: true }));
      console.log(`Đã tạo platform admin ${email}`);
    }
  } finally {
    await ds.destroy();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
