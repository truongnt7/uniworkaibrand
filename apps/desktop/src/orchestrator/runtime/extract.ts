import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppError, type ArchiveType } from '@aps/shared';
import { runProcess } from '../process.js';

/**
 * Windows: dùng bsdtar của hệ điều hành (System32\tar.exe, đọc được cả zip), không dựa vào `tar` đầu tiên trong PATH
 * (máy có Git for Windows sẽ gặp GNU tar: không đọc zip và hiểu "C:\..." là máy từ xa).
 */
export function tarBinary(platform: string = process.platform, env: NodeJS.ProcessEnv = process.env, exists: (p: string) => boolean = existsSync): string {
  if (platform !== 'win32') return 'tar';
  const sys = join(env['SystemRoot'] ?? env['windir'] ?? 'C:\\Windows', 'System32', 'tar.exe');
  return exists(sys) ? sys : 'tar';
}

async function sh(cmd: string, args: string[], signal?: AbortSignal): Promise<void> {
  const r = await runProcess(cmd, args, { signal }).catch((e: NodeJS.ErrnoException) => {
    throw new AppError('EXTRACT_FAILED', `không chạy được ${cmd}: ${e.message}`);
  });
  if (r.aborted) throw new AppError('CANCELED', 'canceled');
  if (r.code !== 0) throw new AppError('EXTRACT_FAILED', `${cmd} thoát với mã ${r.code}`, { stderr: r.stderrTail });
}

/**
 * Giải nén bằng công cụ hệ điều hành (không dùng shell, không tự giải nén JS để tránh path traversal).
 * Chỉ nhánh tar.xz đã được kiểm chứng (Linux). zip (Windows/macOS) và dmg (macOS) chưa kiểm chứng trên máy thật.
 */
export async function extractArchive(archive: string, type: ArchiveType, destDir: string, signal?: AbortSignal): Promise<void> {
  await mkdir(destDir, { recursive: true });
  switch (type) {
    case 'tar.xz':
      return sh(tarBinary(), ['-xJf', archive, '--no-same-owner', '-C', destDir], signal);
    case 'zip':
      // Windows 10+ có bsdtar (`tar`) đọc được zip; macOS/Linux dùng unzip.
      return process.platform === 'win32' ? sh(tarBinary(), ['-xf', archive, '-C', destDir], signal) : sh('unzip', ['-q', '-o', archive, '-d', destDir], signal);
    case 'dmg': {
      if (process.platform !== 'darwin') throw new AppError('EXTRACT_FAILED', 'dmg chỉ giải nén được trên macOS');
      const mount = await mkdtemp(join(tmpdir(), 'aps-dmg-'));
      try {
        await sh('hdiutil', ['attach', '-nobrowse', '-readonly', '-noverify', '-mountpoint', mount, archive], signal);
        try {
          await sh('ditto', [join(mount, 'Blender.app'), join(destDir, 'Blender.app')], signal);
        } finally {
          await sh('hdiutil', ['detach', mount, '-force']).catch(() => {});
        }
      } finally {
        await rm(mount, { recursive: true, force: true });
      }
      return;
    }
  }
}

/** Gói runtime offline (`.apspack`) là tar KHÔNG nén: các archive bên trong đã nén sẵn. */
export async function extractTar(archive: string, destDir: string, signal?: AbortSignal): Promise<void> {
  await mkdir(destDir, { recursive: true });
  return sh(tarBinary(), ['-xf', archive, '--no-same-owner', '-C', destDir], signal);
}
