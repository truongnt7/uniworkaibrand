import { copyFile, mkdir, rm, stat } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { AppError, BusinessProfile, type BusinessProfilePatch } from '@aps/shared';
import type { Db } from './db.js';

/** Bảng khoá-giá trị `settings` (SQLite hiện có). */
export class SettingsStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  get<T>(key: string): T | null {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return null;
    }
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(key, JSON.stringify(value), this.now());
  }
}

const PROFILE_KEY = 'businessProfile';
const LOGO_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp']);

/** Thông tin doanh nghiệp được nhớ (tên, SĐT, địa chỉ, logo, ngành/mẫu lần trước). Logo được chép vào thư mục dữ liệu của app. */
export class ProfileStore {
  constructor(
    private readonly settings: SettingsStore,
    private readonly dir: string,
  ) {}

  get(): BusinessProfile {
    const raw = this.settings.get<unknown>(PROFILE_KEY);
    const parsed = BusinessProfile.safeParse(raw ?? {});
    return parsed.success ? parsed.data : {};
  }

  async set(patch: BusinessProfilePatch): Promise<BusinessProfile> {
    const next: Record<string, unknown> = { ...this.get() };
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'logoPath') continue;
      if (v === null || v === undefined || v === '') delete next[k];
      else next[k] = v;
    }
    if ('logoPath' in patch) {
      if (patch.logoPath === null || patch.logoPath === '') {
        const old = this.get().logoPath;
        delete next.logoPath;
        if (old && this.inside(old)) await rm(old, { force: true });
      } else if (patch.logoPath) {
        next.logoPath = await this.storeLogo(patch.logoPath);
      }
    }
    const parsed = BusinessProfile.parse(next);
    this.settings.set(PROFILE_KEY, parsed);
    return parsed;
  }

  private inside(path: string): boolean {
    return !relative(this.dir, resolve(path)).startsWith('..');
  }

  private async storeLogo(src: string): Promise<string> {
    if (this.inside(src)) return src;
    const ext = extname(src).toLowerCase();
    if (!LOGO_EXT.has(ext)) throw new AppError('LOGO_FORMAT', 'Logo phải là ảnh PNG, JPG hoặc WEBP (tối đa 20 MB).');
    const info = await stat(src);
    if (!info.isFile() || info.size > 20_000_000) throw new AppError('LOGO_FORMAT', 'Logo phải là ảnh PNG, JPG hoặc WEBP (tối đa 20 MB).');
    await mkdir(this.dir, { recursive: true });
    // Tên có dấu thời gian để renderer nạp lại hình mới khi đổi logo.
    const dest = join(this.dir, `logo-${Date.now()}${ext}`);
    await copyFile(src, dest);
    const old = this.get().logoPath;
    if (old && this.inside(old) && old !== dest) await rm(old, { force: true });
    return dest;
  }
}
