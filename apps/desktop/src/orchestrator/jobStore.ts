import { randomUUID } from 'node:crypto';
import { JobRecord, RenderRequest, totalFramesFor, type JobStatus } from '@aps/shared';
import type { Db } from './db.js';

interface Row {
  id: string;
  name: string;
  target: string;
  priority: string;
  status: string;
  kind: string;
  engine: string;
  request_json: string;
  frame: number;
  total_frames: number;
  progress: number;
  estimate_s: number | null;
  cost_credits: number | null;
  error_code: string | null;
  error_message: string | null;
  device_info: string | null;
  work_dir: string | null;
  output_path: string | null;
  attempts: number;
  created_at: number;
  updated_at: number;
  started_at: number | null;
  finished_at: number | null;
}

export type JobPatch = Partial<
  Pick<
    JobRecord,
    | 'status'
    | 'frame'
    | 'totalFrames'
    | 'progress'
    | 'estimateS'
    | 'costCredits'
    | 'errorCode'
    | 'errorMessage'
    | 'deviceInfo'
    | 'workDir'
    | 'outputPath'
    | 'attempts'
    | 'startedAt'
    | 'finishedAt'
  >
>;

const COLUMN: Record<keyof JobPatch, string> = {
  status: 'status',
  frame: 'frame',
  totalFrames: 'total_frames',
  progress: 'progress',
  estimateS: 'estimate_s',
  costCredits: 'cost_credits',
  errorCode: 'error_code',
  errorMessage: 'error_message',
  deviceInfo: 'device_info',
  workDir: 'work_dir',
  outputPath: 'output_path',
  attempts: 'attempts',
  startedAt: 'started_at',
  finishedAt: 'finished_at',
};

function toRecord(r: Row): JobRecord {
  return JobRecord.parse({
    id: r.id,
    name: r.name,
    target: r.target,
    priority: r.priority,
    status: r.status,
    kind: r.kind,
    engine: r.engine,
    request: JSON.parse(r.request_json),
    frame: r.frame,
    totalFrames: r.total_frames,
    progress: r.progress,
    estimateS: r.estimate_s,
    costCredits: r.cost_credits,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    deviceInfo: r.device_info,
    workDir: r.work_dir,
    outputPath: r.output_path,
    attempts: r.attempts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  });
}

export class JobStore {
  constructor(
    private readonly db: Db,
    private readonly now: () => number = Date.now,
  ) {}

  insert(request: RenderRequest, id: string = randomUUID()): JobRecord {
    const t = this.now();
    this.db
      .prepare(
        `INSERT INTO jobs (id, name, target, priority, status, kind, engine, request_json, total_frames, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        request.name,
        request.target,
        request.priority,
        request.output.kind,
        request.output.engine,
        JSON.stringify(request),
        totalFramesFor(request.output),
        t,
        t,
      );
    return this.mustGet(id);
  }

  get(id: string): JobRecord | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(id) as unknown as Row | undefined;
    return row ? toRecord(row) : null;
  }

  mustGet(id: string): JobRecord {
    const job = this.get(id);
    if (!job) throw new Error(`Không có job ${id}`);
    return job;
  }

  list(): JobRecord[] {
    const rows = this.db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC').all() as unknown as Row[];
    return rows.map(toRecord);
  }

  listByStatus(...statuses: JobStatus[]): JobRecord[] {
    const marks = statuses.map(() => '?').join(',');
    const rows = this.db
      .prepare(`SELECT * FROM jobs WHERE status IN (${marks}) ORDER BY created_at ASC, rowid ASC`)
      .all(...statuses) as unknown as Row[];
    return rows.map(toRecord);
  }

  /** Job `local` đang chờ, ưu tiên preview trước final, rồi theo thứ tự tạo. Job `cloud` không bao giờ được chọn. */
  nextRunnable(): JobRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM jobs WHERE status = 'queued' AND target = 'local'
         ORDER BY CASE priority WHEN 'preview' THEN 0 ELSE 1 END, created_at ASC, rowid ASC LIMIT 1`,
      )
      .get() as unknown as Row | undefined;
    return row ? toRecord(row) : null;
  }

  update(id: string, patch: JobPatch): JobRecord {
    const entries = Object.entries(patch) as [keyof JobPatch, unknown][];
    const sets = entries.map(([k]) => `${COLUMN[k]} = ?`);
    sets.push('updated_at = ?');
    const values = entries.map(([, v]) => (v === undefined ? null : v)) as (string | number | null)[];
    this.db.prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values, this.now(), id);
    return this.mustGet(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  }
}
