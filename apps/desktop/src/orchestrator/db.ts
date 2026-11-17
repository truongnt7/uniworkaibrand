import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * SQLite dùng module có sẵn `node:sqlite` (Node >= 22.13 / Electron 43 = Node 24) để khỏi phải rebuild
 * native module cho từng hệ điều hành; toàn bộ truy cập đi qua file này nên đổi sang better-sqlite3 là việc nhỏ.
 */
export type Db = DatabaseSync;

export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE jobs (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     target TEXT NOT NULL CHECK (target IN ('local','cloud')),
     priority TEXT NOT NULL CHECK (priority IN ('preview','final')),
     status TEXT NOT NULL CHECK (status IN ('queued','preparing','rendering','encoding','done','failed','canceled')),
     kind TEXT NOT NULL CHECK (kind IN ('image','video')),
     engine TEXT NOT NULL,
     request_json TEXT NOT NULL,
     frame INTEGER NOT NULL DEFAULT 0,
     total_frames INTEGER NOT NULL DEFAULT 1,
     progress REAL NOT NULL DEFAULT 0,
     estimate_s REAL,
     cost_credits REAL,
     error_code TEXT,
     error_message TEXT,
     device_info TEXT,
     work_dir TEXT,
     output_path TEXT,
     attempts INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     started_at INTEGER,
     finished_at INTEGER
   );
   CREATE INDEX idx_jobs_status ON jobs(status, priority, created_at);`,
];

export function migrate(db: Db, dbPath: string | null): void {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number } | undefined;
  const current = row?.user_version ?? 0;
  if (current >= MIGRATIONS.length) return;
  if (dbPath && current > 0 && existsSync(dbPath)) {
    copyFileSync(dbPath, `${dbPath}.bak-v${current}`);
  }
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec('BEGIN');
    try {
      db.exec(MIGRATIONS[v] as string);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  migrate(db, path === ':memory:' ? null : path);
  return db;
}
