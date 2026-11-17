import { randomBytes } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  AppError,
  type RuntimeArtifact,
  type RuntimeManifest,
  type RuntimeProgress,
  type RuntimeStatus,
} from '@aps/shared';
import { currentPlatformKey, selectArtifact } from './manifest.js';
import { downloadVerified, ensureDiskSpace, sha256File, type DownloadOptions } from './download.js';
import { extractArchive } from './extract.js';
import { runSmokeTest } from './smoke.js';

export interface RuntimeManagerOptions {
  /** Thư mục gốc của runtime (userData/runtime). */
  dir: string;
  loadManifest: () => Promise<RuntimeManifest>;
  workerScript: string;
  platformKey?: string;
  onProgress?: (p: RuntimeProgress) => void;
  /** Ghi đè dành cho dev/test: dùng sẵn một binary Blender có trên máy, bỏ qua tải. */
  binaryOverride?: string | null;
  /** Các hàm thay thế được trong test. */
  download?: (opts: DownloadOptions) => Promise<void>;
  extract?: typeof extractArchive;
  smoke?: typeof runSmokeTest;
  diskCheck?: typeof ensureDiskSpace;
  maxAttempts?: number;
  backoffMs?: (attempt: number) => number;
  sleep?: DownloadOptions['sleep'];
  fetchImpl?: typeof fetch;
}

interface ActiveFile {
  version: string;
  platform: string;
  dir: string;
  binary: string;
  sha256: string;
  installedAt: number;
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
 * Tải/kiểm/cài runtime Blender: manifest ký -> tải (tiến trình, Range, retry) -> sha256 -> giải nén vào thư mục tạm
 * -> smoke test -> kích hoạt nguyên tử. Bất kỳ bước nào lỗi: dọn thư mục tạm, giữ nguyên bản đang dùng.
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

  private async readStatus(busy: boolean): Promise<RuntimeStatus> {
    if (this.opts.binaryOverride) {
      return { installed: true, version: 'external', binaryPath: this.opts.binaryOverride, platform: this.platformKey, busy };
    }
    try {
      const active = JSON.parse(await readFile(this.activePath, 'utf8')) as ActiveFile;
      const binary = join(active.dir, active.binary);
      if (await pathExists(binary)) return { installed: true, version: active.version, binaryPath: binary, platform: this.platformKey, busy };
    } catch {
      // chưa cài
    }
    return { installed: false, version: null, binaryPath: null, platform: this.platformKey, busy };
  }

  async getBinaryPath(): Promise<string> {
    const s = await this.status();
    if (!s.installed || !s.binaryPath) throw new AppError('RUNTIME_MISSING', 'chưa cài Blender runtime');
    return s.binaryPath;
  }

  cancelInstall(): void {
    this.abort?.abort();
  }

  install(): Promise<RuntimeStatus> {
    return this.single(async (signal) => {
      const manifest = await this.opts.loadManifest();
      const artifact = selectArtifact(manifest, this.platformKey);
      const archive = join(this.opts.dir, 'downloads', `blender-${manifest.blender.version}-${this.platformKey}.${artifact.archive}`);
      await mkdir(dirname(archive), { recursive: true });

      const needed = artifact.size + (artifact.extractedSize ?? artifact.size * 3);
      await (this.opts.diskCheck ?? ensureDiskSpace)(this.opts.dir, needed);

      await (this.opts.download ?? downloadVerified)({
        urls: [artifact.url, ...artifact.mirrors],
        dest: archive,
        sha256: artifact.sha256,
        size: artifact.size,
        maxAttempts: this.opts.maxAttempts,
        backoffMs: this.opts.backoffMs,
        sleep: this.opts.sleep,
        fetchImpl: this.opts.fetchImpl,
        signal,
        onProgress: (p) => this.emitDownload(p),
        onVerifying: () => this.emit({ phase: 'verifying' }),
        onRetry: (r) =>
          this.emit({ phase: 'retrying', attempt: r.attempt, maxAttempts: r.maxAttempts, errorCode: r.error.code, message: r.error.message }),
      });
      return this.finishInstall(manifest, artifact, archive, signal, true);
    });
  }

  /** "Nhập runtime từ file…": bộ cài offline dùng cùng manifest và cùng bước kiểm sha256. */
  importFromFile(path: string): Promise<RuntimeStatus> {
    return this.single(async (signal) => {
      const manifest = await this.opts.loadManifest();
      const artifact = selectArtifact(manifest, this.platformKey);
      const info = await stat(path).catch(() => null);
      if (!info) throw new AppError('EXTRACT_FAILED', `không thấy file: ${path}`);
      if (info.size !== artifact.size) throw new AppError('SIZE_MISMATCH', `kích thước ${info.size} khác kỳ vọng ${artifact.size}`);
      this.emit({ phase: 'verifying' });
      const digest = await sha256File(path);
      if (digest !== artifact.sha256) throw new AppError('CHECKSUM_MISMATCH', 'file runtime không khớp sha256 trong manifest');
      return this.finishInstall(manifest, artifact, path, signal, false);
    });
  }

  private async finishInstall(
    manifest: RuntimeManifest,
    artifact: RuntimeArtifact,
    archive: string,
    signal: AbortSignal,
    deleteArchive: boolean,
  ): Promise<RuntimeStatus> {
    const version = manifest.blender.version;
    const tmpDir = join(this.opts.dir, `tmp-${randomBytes(4).toString('hex')}`);
    const finalDir = join(this.opts.dir, `blender-${version}-${this.platformKey}`);
    let oldDir: string | null = null;
    try {
      this.emit({ phase: 'extracting' });
      await extractWith(this.opts.extract ?? extractArchive, archive, artifact, tmpDir, signal);
      const binary = join(tmpDir, artifact.binary);
      if (!(await pathExists(binary))) throw new AppError('EXTRACT_FAILED', `không thấy binary sau giải nén: ${artifact.binary}`);

      this.emit({ phase: 'smoke-test' });
      await (this.opts.smoke ?? runSmokeTest)({
        binary,
        expectedVersion: version,
        workerScript: this.opts.workerScript,
        workDir: tmpDir,
        signal,
      });

      this.emit({ phase: 'activating' });
      try {
        if (await pathExists(finalDir)) {
          oldDir = `${finalDir}.old-${randomBytes(3).toString('hex')}`;
          await rename(finalDir, oldDir);
        }
        await rename(tmpDir, finalDir);
        const active: ActiveFile = {
          version,
          platform: this.platformKey,
          dir: finalDir,
          binary: artifact.binary,
          sha256: artifact.sha256,
          installedAt: Date.now(),
        };
        await writeJsonAtomic(this.activePath, active);
      } catch (err) {
        if (oldDir && !(await pathExists(finalDir))) await rename(oldDir, finalDir).catch(() => {});
        oldDir = null;
        if (err instanceof AppError) throw err;
        throw new AppError('ACTIVATE_FAILED', err instanceof Error ? err.message : String(err));
      }
      if (oldDir) await rm(oldDir, { recursive: true, force: true });
      if (deleteArchive) await rm(archive, { force: true });
      this.emit({ phase: 'done' });
      return await this.readStatus(false);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  }

  private async single(fn: (signal: AbortSignal) => Promise<RuntimeStatus>): Promise<RuntimeStatus> {
    if (this.installing) return this.installing;
    const abort = new AbortController();
    this.abort = abort;
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

  private emitDownload(p: { receivedBytes: number; totalBytes: number; bytesPerSecond: number }): void {
    const now = Date.now();
    if (p.receivedBytes < p.totalBytes && now - this.lastDownloadEmit < 150) return;
    this.lastDownloadEmit = now;
    this.emit({ phase: 'downloading', ...p });
  }

  private emit(p: Partial<RuntimeProgress> & Pick<RuntimeProgress, 'phase'>): void {
    this.opts.onProgress?.({
      receivedBytes: 0,
      totalBytes: 0,
      bytesPerSecond: 0,
      attempt: 0,
      maxAttempts: 0,
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
