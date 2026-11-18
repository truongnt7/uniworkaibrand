import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AppError,
  runtimePackageComponents,
  type RuntimeArtifact,
  type RuntimeComponentId,
  type RuntimeManifest,
  type RuntimePackageId,
  type RuntimeProgress,
  type RuntimeStatus,
} from '@aps/shared';
import { currentPlatformKey, selectArtifact, selectFfmpegArtifact } from './manifest.js';
import { PACK_EXTENSION, openPack } from './pack.js';
import { downloadVerified, ensureDiskSpace, sha256File, type DownloadOptions } from './download.js';
import { extractArchive } from './extract.js';
import { runSmokeTest } from './smoke.js';
import { checkFfmpegBinary } from './ffmpegCheck.js';

export interface RuntimeManagerOptions {
  /** Thư mục gốc của runtime (userData/runtime). */
  dir: string;
  loadManifest: () => Promise<RuntimeManifest>;
  /** Kiểm chữ ký + parse manifest nằm trong gói offline (dùng đúng tập khóa tin cậy của app). */
  parseManifest?: (raw: unknown) => Promise<RuntimeManifest> | RuntimeManifest;
  workerScript: string;
  platformKey?: string;
  onProgress?: (p: RuntimeProgress) => void;
  /** Ghi đè dành cho dev/test: dùng sẵn một binary Blender có trên máy, bỏ qua tải. */
  binaryOverride?: string | null;
  /** Ghi đè dev: binary ffmpeg có sẵn (vẫn bị kiểm chính sách LGPL khi render). */
  ffmpegOverride?: string | null;
  /** Các hàm thay thế được trong test. */
  download?: (opts: DownloadOptions) => Promise<void>;
  extract?: typeof extractArchive;
  smoke?: typeof runSmokeTest;
  ffmpegCheck?: (binary: string, signal?: AbortSignal) => Promise<void>;
  diskCheck?: typeof ensureDiskSpace;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: DownloadOptions['sleep'];
  fetchImpl?: typeof fetch;
}

type Kind = RuntimeComponentId;

const ALL_PACKAGES: readonly RuntimePackageId[] = ['ffmpeg', 'blender'];

interface ActiveComponent {
  version: string;
  dir: string;
  binary: string;
  sha256: string;
}

interface ActiveFile extends ActiveComponent {
  platform: string;
  installedAt: number;
  ffmpeg?: ActiveComponent;
}

interface Pending {
  kind: Kind;
  version: string;
  artifact: RuntimeArtifact;
  archive: string;
  deleteArchive: boolean;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}

/**
 * Tải/kiểm/cài runtime (Blender + FFmpeg LGPL): manifest ký -> tải (tiến trình, Range, retry) -> sha256 -> giải nén vào thư mục tạm
 * -> kiểm tra (smoke test Blender / chính sách LGPL FFmpeg) -> kích hoạt nguyên tử cả hai. Bất kỳ bước nào lỗi: dọn thư mục tạm,
 * giữ nguyên bản đang dùng.
 */
export class RuntimeManager {
  private installing: Promise<RuntimeStatus> | null = null;
  private abort: AbortController | null = null;

  constructor(private readonly opts: RuntimeManagerOptions) {}

  private get platformKey(): string {
    return this.opts.platformKey ?? currentPlatformKey();
  }

  private get activePath(): string {
    return join(this.opts.dir, 'active.json');
  }

  async status(): Promise<RuntimeStatus> {
    return this.readStatus(this.installing !== null);
  }

  private async readActive(): Promise<ActiveFile | null> {
    try {
      return JSON.parse(await readFile(this.activePath, 'utf8')) as ActiveFile;
    } catch {
      return null;
    }
  }

  private async readStatus(busy: boolean): Promise<RuntimeStatus> {
    const active = await this.readActive();
    const ffmpegBin = active?.ffmpeg ? join(active.ffmpeg.dir, active.ffmpeg.binary) : null;
    const ffmpegActive = ffmpegBin && (await pathExists(ffmpegBin)) ? ffmpegBin : null;
    const ffmpegPath = this.opts.ffmpegOverride ?? ffmpegActive;
    const ffmpegPkg = { installed: ffmpegPath !== null, version: this.opts.ffmpegOverride ? 'external' : ffmpegActive ? (active?.ffmpeg?.version ?? null) : null };
    const base = { ffmpegPath, platform: this.platformKey, busy };
    if (this.opts.binaryOverride) {
      return { installed: true, version: 'external', binaryPath: this.opts.binaryOverride, ...base, packages: { ffmpeg: ffmpegPkg, blender: { installed: true, version: 'external' } } };
    }
    if (active?.version && active.dir) {
      const binary = join(active.dir, active.binary);
      if (await pathExists(binary)) {
        return { installed: true, version: active.version, binaryPath: binary, ...base, packages: { ffmpeg: ffmpegPkg, blender: { installed: true, version: active.version } } };
      }
    }
    return { installed: false, version: null, binaryPath: null, ...base, packages: { ffmpeg: ffmpegPkg, blender: { installed: false, version: null } } };
  }

  async getBinaryPath(): Promise<string> {
    const s = await this.status();
    if (!s.installed || !s.binaryPath) throw new AppError('RUNTIME_MISSING', 'chưa cài Blender runtime');
    return s.binaryPath;
  }

  async getFfmpegPath(): Promise<string> {
    const s = await this.status();
    if (!s.ffmpegPath) throw new AppError('FFMPEG_MISSING', 'chưa cài FFmpeg (LGPL) trong runtime');
    return s.ffmpegPath;
  }

  cancelInstall(): void {
    this.abort?.abort();
  }

  /**
   * Cài các gói được yêu cầu (mặc định tất cả). Mỗi thành phần cần cài được tải, kiểm sha256, giải nén, kiểm tra và kích hoạt
   * riêng, nên gói ffmpeg dùng được ngay cả khi gói blender (nặng hơn) chưa xong; thành phần đã cài đúng phiên bản/sha256 thì bỏ qua.
   */
  async install(packages?: readonly RuntimePackageId[]): Promise<RuntimeStatus> {
    const want = [...new Set(packages && packages.length > 0 ? packages : ALL_PACKAGES)].sort();
    const key = want.join('+');
    if (this.installing && this.installingKey === key) return this.installing;
    if (this.installing) await this.installing.catch(() => undefined);
    if (this.installing && this.installingKey === key) return this.installing;
    this.installingKey = key;
    return this.single(async (signal) => {
      const manifest = await this.opts.loadManifest();
      const kinds = [...new Set(want.flatMap((id) => runtimePackageComponents(manifest, id)))];
      const comps = this.componentsOf(manifest, kinds);
      const active = await this.readActive();
      const todo: ReturnType<RuntimeManager['componentsOf']> = [];
      for (const c of comps) if (!(await this.isActive(active, c))) todo.push(c);
      if (todo.length === 0) {
        this.emit({ phase: 'done' });
        return this.readStatus(false);
      }
      const needed = todo.reduce((n, c) => n + c.artifact.size + (c.artifact.extractedSize ?? c.artifact.size * 3), 0);
      await mkdir(join(this.opts.dir, 'downloads'), { recursive: true });
      await (this.opts.diskCheck ?? ensureDiskSpace)(this.opts.dir, needed);

      this.steps = todo.length;
      for (const [i, c] of todo.entries()) {
        this.step = i + 1;
        const archive = join(this.opts.dir, 'downloads', `${c.kind}-${c.version}-${this.platformKey}.${c.artifact.archive}`);
        if (!(await this.archiveVerified(archive, c.artifact))) {
          await (this.opts.download ?? downloadVerified)({
            urls: [c.artifact.url, ...c.artifact.mirrors],
            dest: archive,
            sha256: c.artifact.sha256,
            size: c.artifact.size,
            maxAttempts: this.opts.maxAttempts,
            backoffMs: this.opts.backoffMs,
            sleep: this.opts.sleep,
            fetchImpl: this.opts.fetchImpl,
            signal,
            onProgress: (p) => this.emitDownload(c.kind, p),
            onVerifying: () => this.emit({ component: c.kind, phase: 'verifying' }),
            onRetry: (r) =>
              this.emit({ component: c.kind, phase: 'retrying', attempt: r.attempt, maxAttempts: r.maxAttempts, errorCode: r.error.code, message: r.error.message }),
          });
        }
        await this.finishInstall([{ ...c, archive, deleteArchive: true }], signal, i === todo.length - 1);
      }
      return this.readStatus(false);
    });
  }

  private installingKey = '';
  private step = 0;
  private steps = 0;

  /** Archive đã tải xong ở lần trước (đã xác minh) thì dùng lại, không tải lại từ đầu. */
  private async archiveVerified(path: string, artifact: RuntimeArtifact): Promise<boolean> {
    const info = await stat(path).catch(() => null);
    if (!info || info.size !== artifact.size) return false;
    return (await sha256File(path)) === artifact.sha256;
  }

  private async isActive(active: ActiveFile | null, c: { kind: Kind; version: string; artifact: RuntimeArtifact }): Promise<boolean> {
    if (this.opts.binaryOverride && c.kind === 'blender') return true;
    if (this.opts.ffmpegOverride && c.kind === 'ffmpeg') return true;
    const entry = c.kind === 'blender' ? (active?.version ? active : null) : (active?.ffmpeg ?? null);
    if (!entry || entry.version !== c.version || entry.sha256 !== c.artifact.sha256) return false;
    return pathExists(join(entry.dir, entry.binary));
  }

  /**
   * "Nhập runtime từ file…". Hai dạng: gói offline `.apspack` (Blender + FFmpeg + manifest ký, xác minh chữ ký và sha256 từng
   * thành phần), hoặc archive Blender đơn lẻ khớp sha256 trong manifest của app.
   */
  importFromFile(path: string): Promise<RuntimeStatus> {
    return this.single(async (signal) => {
      if (path.toLowerCase().endsWith(PACK_EXTENSION)) return this.importPack(path, signal);
      const manifest = await this.opts.loadManifest();
      const info = await stat(path).catch(() => null);
      if (!info) throw new AppError('EXTRACT_FAILED', `không thấy file: ${path}`);
      const candidates = this.componentsOf(manifest, ['blender', 'ffmpeg'], true);
      const blender = candidates.find((c) => c.kind === 'blender') ?? { kind: 'blender' as const, version: manifest.blender.version, artifact: selectArtifact(manifest, this.platformKey) };
      const match = candidates.find((c) => c.artifact.size === info.size) ?? blender;
      if (info.size !== match.artifact.size) throw new AppError('SIZE_MISMATCH', `kích thước ${info.size} khác kỳ vọng ${match.artifact.size}`);
      this.emit({ component: match.kind, phase: 'verifying' });
      const digest = await sha256File(path);
      if (digest !== match.artifact.sha256) throw new AppError('CHECKSUM_MISMATCH', 'file runtime không khớp sha256 trong manifest');
      this.steps = 1;
      this.step = 1;
      return this.finishInstall([{ ...match, archive: path, deleteArchive: false }], signal);
    });
  }

  private async importPack(path: string, signal: AbortSignal): Promise<RuntimeStatus> {
    const parse = this.opts.parseManifest;
    if (!parse) throw new AppError('PACK_INVALID', 'app chưa cấu hình kiểm chữ ký cho gói offline');
    const workDir = join(this.opts.dir, `pack-${randomBytes(4).toString('hex')}`);
    try {
      this.emit({ phase: 'verifying' });
      const opened = await openPack(path, workDir, this.platformKey, parse, signal);
      const pending: Pending[] = [];
      if (opened.blender) {
        pending.push({ kind: 'blender', version: opened.manifest.blender.version, artifact: opened.blender.artifact, archive: opened.blender.path, deleteArchive: false });
      }
      if (opened.ffmpeg && opened.manifest.ffmpeg) {
        pending.push({ kind: 'ffmpeg', version: opened.manifest.ffmpeg.version, artifact: opened.ffmpeg.artifact, archive: opened.ffmpeg.path, deleteArchive: false });
      }
      this.steps = 1;
      this.step = 1;
      return await this.finishInstall(pending, signal);
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  }

  /** Thành phần (theo thứ tự `kinds`) mà manifest có cho nền tảng này. `lenient`: thiếu artifact thì bỏ qua thay vì báo lỗi. */
  private componentsOf(manifest: RuntimeManifest, kinds: readonly Kind[], lenient = false): Omit<Pending, 'archive' | 'deleteArchive'>[] {
    const list: Omit<Pending, 'archive' | 'deleteArchive'>[] = [];
    for (const kind of kinds) {
      try {
        if (kind === 'blender') list.push({ kind, version: manifest.blender.version, artifact: selectArtifact(manifest, this.platformKey) });
        else {
          const ff = selectFfmpegArtifact(manifest, this.platformKey);
          if (ff && manifest.ffmpeg) list.push({ kind, version: manifest.ffmpeg.version, artifact: ff });
        }
      } catch (err) {
        if (!lenient) throw err;
      }
    }
    return list;
  }

  private async finishInstall(pending: Pending[], signal: AbortSignal, last = true): Promise<RuntimeStatus> {
    const tmpDir = join(this.opts.dir, `tmp-${randomBytes(4).toString('hex')}`);
    const swapped: { finalDir: string; oldDir: string | null }[] = [];
    try {
      const extracted: { p: Pending; dir: string; binary: string }[] = [];
      for (const p of pending) {
        const dir = join(tmpDir, p.kind);
        this.emit({ component: p.kind, phase: 'extracting' });
        await extractWith(this.opts.extract ?? extractArchive, p.archive, p.artifact, dir, signal);
        const binary = join(dir, p.artifact.binary);
        if (!(await pathExists(binary))) throw new AppError('EXTRACT_FAILED', `không thấy binary sau giải nén: ${p.artifact.binary}`);
        this.emit({ component: p.kind, phase: 'smoke-test' });
        if (p.kind === 'blender') {
          await (this.opts.smoke ?? runSmokeTest)({ binary, expectedVersion: p.version, workerScript: this.opts.workerScript, workDir: tmpDir, signal });
        } else {
          await (this.opts.ffmpegCheck ?? checkFfmpegBinary)(binary, signal);
        }
        extracted.push({ p, dir, binary });
      }

      this.emit({ component: pending[pending.length - 1]!.kind, phase: 'activating' });
      const previous = await this.readActive();
      const next: ActiveFile = previous
        ? { ...previous, installedAt: Date.now() }
        : ({ version: '', dir: '', binary: '', sha256: '', platform: this.platformKey, installedAt: Date.now() } as ActiveFile);
      next.platform = this.platformKey;
      try {
        for (const { p, dir } of extracted) {
          const finalDir = join(this.opts.dir, `${p.kind}-${p.version}-${this.platformKey}`);
          let oldDir: string | null = null;
          if (await pathExists(finalDir)) {
            oldDir = `${finalDir}.old-${randomBytes(3).toString('hex')}`;
            await rename(finalDir, oldDir);
          }
          await rename(dir, finalDir);
          swapped.push({ finalDir, oldDir });
          const entry: ActiveComponent = { version: p.version, dir: finalDir, binary: p.artifact.binary, sha256: p.artifact.sha256 };
          if (p.kind === 'blender') Object.assign(next, entry);
          else next.ffmpeg = entry;
        }
        await writeJsonAtomic(this.activePath, next);
      } catch (err) {
        for (const { finalDir, oldDir } of swapped.reverse()) {
          await rm(finalDir, { recursive: true, force: true }).catch(() => {});
          if (oldDir) await rename(oldDir, finalDir).catch(() => {});
        }
        swapped.length = 0;
        if (err instanceof AppError) throw err;
        throw new AppError('ACTIVATE_FAILED', err instanceof Error ? err.message : String(err));
      }
      for (const { oldDir } of swapped) if (oldDir) await rm(oldDir, { recursive: true, force: true });
      for (const p of pending) if (p.deleteArchive) await rm(p.archive, { force: true });
      if (last) this.emit({ component: pending[pending.length - 1]!.kind, phase: 'done' });
      return await this.readStatus(false);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async single(fn: (signal: AbortSignal) => Promise<RuntimeStatus>): Promise<RuntimeStatus> {
    if (this.installing) return this.installing;
    const abort = new AbortController();
    this.abort = abort;
    this.step = 0;
    this.steps = 0;
    this.installing = fn(abort.signal)
      .catch((err: unknown) => {
        const appErr = err instanceof AppError ? err : new AppError('UNKNOWN', err instanceof Error ? err.message : String(err));
        this.emit({ phase: 'error', errorCode: appErr.code, message: appErr.message });
        throw appErr;
      })
      .finally(() => {
        this.installing = null;
        this.abort = null;
      });
    return this.installing;
  }

  private lastDownloadEmit = 0;

  private emitDownload(component: Kind, p: { receivedBytes: number; totalBytes: number; bytesPerSecond: number }): void {
    const now = Date.now();
    if (p.receivedBytes < p.totalBytes && now - this.lastDownloadEmit < 150) return;
    this.lastDownloadEmit = now;
    this.emit({ component, phase: 'downloading', ...p });
  }

  private emit(p: Partial<RuntimeProgress> & Pick<RuntimeProgress, 'phase'>): void {
    this.opts.onProgress?.({
      component: 'blender',
      receivedBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
      attempt: 0,
      maxAttempts: 0,
      ...(this.steps > 0 ? { step: this.step, steps: this.steps } : {}),
      ...p,
    });
  }
}

async function extractWith(
  extract: typeof extractArchive,
  archive: string,
  artifact: RuntimeArtifact,
  dest: string,
  signal: AbortSignal,
): Promise<void> {
  try {
    await extract(archive, artifact.archive, dest, signal);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('EXTRACT_FAILED', err instanceof Error ? err.message : String(err));
  }
}
