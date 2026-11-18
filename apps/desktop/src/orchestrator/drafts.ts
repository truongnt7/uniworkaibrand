import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { AppError, Draft, DraftForm, DraftSaveReq, type DraftSummary } from '@aps/shared';
import type { Db } from './db.js';

export const MAX_DRAFTS = 100;
export const DEFAULT_DRAFT_NAME = 'Bài chưa đặt tên';

interface Row {
  id: string;
  name: string;
  form_json: string;
  created_at: number;
  updated_at: number;
}

function summarize(row: Row, form: DraftForm): DraftSummary {
  return {
    id: row.id,
    name: row.name,
    industry: form.industry,
    templateId: form.templateId,
    photoCount: Object.keys(form.photos).length,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseForm(json: string): DraftForm | null {
  try {
    const parsed = DraftForm.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Lưu nháp từng bài (SQLite, bảng `drafts` ở migration v4). Ảnh/logo/nhạc lưu bằng đường dẫn tệp; ảnh HEIC đã được chuyển sang JPG
 * trong thư mục dữ liệu của app nên bền. Khi mở lại, tệp nào không còn trên máy được liệt kê ở `missing` để giao diện báo chọn lại.
 */
export class DraftStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
    private readonly exists: (path: string) => boolean = existsSync,
  ) {}

  list(): DraftSummary[] {
    const rows = this.db.prepare('SELECT * FROM drafts ORDER BY updated_at DESC, rowid DESC LIMIT ?').all(MAX_DRAFTS) as unknown as Row[];
    const out: DraftSummary[] = [];
    for (const row of rows) {
      const form = parseForm(row.form_json);
      if (form) out.push(summarize(row, form));
    }
    return out;
  }

  get(id: string): Draft | null {
    const row = this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(id) as Row | undefined;
    if (!row) return null;
    const form = parseForm(row.form_json);
    if (!form) return null;
    const paths = [...Object.values(form.photos), ...(form.logoPath ? [form.logoPath] : []), ...(form.musicPath ? [form.musicPath] : [])];
    return { ...summarize(row, form), form, missing: [...new Set(paths.filter((p) => !this.exists(p)))] };
  }

  save(input: DraftSaveReq): DraftSummary {
    const req = DraftSaveReq.parse(input);
    const name = req.name.trim() || DEFAULT_DRAFT_NAME;
    const formJson = JSON.stringify(req.form);
    if (formJson.length > 64 * 1024) throw new AppError('DRAFT_TOO_LARGE', 'bản nháp quá lớn');
    const now = this.now();
    const existing = req.id ? (this.db.prepare('SELECT * FROM drafts WHERE id = ?').get(req.id) as Row | undefined) : undefined;
    let row: Row;
    if (existing) {
      row = { ...existing, name, form_json: formJson, updated_at: Math.max(now, existing.updated_at) };
      this.db.prepare('UPDATE drafts SET name = ?, form_json = ?, updated_at = ? WHERE id = ?').run(name, formJson, row.updated_at, row.id);
    } else {
      row = { id: req.id ?? randomUUID(), name, form_json: formJson, created_at: now, updated_at: now };
      this.db.prepare('INSERT INTO drafts (id, name, form_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(row.id, name, formJson, now, now);
      this.prune();
    }
    return summarize(row, req.form);
  }

  remove(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM drafts WHERE id = ?').run(id).changes) > 0;
  }

  private prune(): void {
    this.db
      .prepare('DELETE FROM drafts WHERE id IN (SELECT id FROM drafts ORDER BY updated_at DESC, rowid DESC LIMIT -1 OFFSET ?)')
      .run(MAX_DRAFTS);
  }
}
