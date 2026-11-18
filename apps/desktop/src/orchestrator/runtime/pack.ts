import { readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { z } from 'zod';
import { AppError, DEFAULT_RUNTIME_PACKAGES, RuntimePackageId, SignedManifest, type RuntimeArtifact, type RuntimeManifest } from '@aps/shared';
import { sha256File } from './download.js';
import { extractTar } from './extract.js';
import { selectArtifact, selectFfmpegArtifact } from './manifest.js';

export const PACK_EXTENSION = '.apspack';
export const PACK_INDEX = 'pack.json';

/** `pack.json`: chỉ chứa manifest ĐÃ KÝ (nguồn sự thật duy nhất); kích thước/sha256 lấy từ manifest, không tin danh sách file. */
export const PackIndex = z.object({
  format: z.literal(1),
  platform: z.string(),
  manifest: SignedManifest,
  /** Thêm sau: gói chứa trong file này (`ffmpeg` nhẹ, `blender`). Thiếu = gói đầy đủ cả hai (định dạng cũ). */
  packages: z.array(RuntimePackageId).min(1).max(2).optional(),
});
export type PackIndex = z.infer<typeof PackIndex>;

export function artifactFileName(a: RuntimeArtifact): string {
  const name = basename(new URL(a.url).pathname);
  if (!name || name !== basename(name)) throw new AppError('PACK_INVALID', `tên file không hợp lệ: ${a.url}`);
  return name;
}

export interface OpenedPack {
  manifest: RuntimeManifest;
  blender: { artifact: RuntimeArtifact; path: string } | null;
  ffmpeg: { artifact: RuntimeArtifact; path: string } | null;
}

async function verifyFile(path: string, a: RuntimeArtifact, label: string): Promise<void> {
  const info = await stat(path).catch(() => null);
  if (!info) throw new AppError('PACK_INVALID', `gói thiếu ${label}`);
  if (info.size !== a.size) throw new AppError('SIZE_MISMATCH', `${label}: kích thước ${info.size} khác kỳ vọng ${a.size}`);
  if ((await sha256File(path)) !== a.sha256) throw new AppError('CHECKSUM_MISMATCH', `${label}: không khớp sha256 trong manifest ký`);
}

/**
 * Mở gói offline: giải nén tar vào `workDir`, xác minh chữ ký manifest bằng `parseManifest` (khóa tin cậy của app),
 * rồi xác minh từng thành phần theo sha256 của manifest. Gói sai chữ ký/sai hash bị từ chối trước khi cài.
 */
export async function openPack(
  packPath: string,
  workDir: string,
  platformKey: string,
  parseManifest: (raw: unknown) => Promise<RuntimeManifest> | RuntimeManifest,
  signal?: AbortSignal,
): Promise<OpenedPack> {
  await extractTar(packPath, workDir, signal).catch((e) => {
    throw new AppError('PACK_INVALID', `không đọc được gói: ${(e as Error).message}`);
  });
  let index: PackIndex;
  try {
    index = PackIndex.parse(JSON.parse(await readFile(join(workDir, PACK_INDEX), 'utf8')));
  } catch (e) {
    throw new AppError('PACK_INVALID', `pack.json không hợp lệ: ${(e as Error).message}`);
  }
  const manifest = await parseManifest(index.manifest);
  const wanted = new Set(index.packages ? index.packages.flatMap((id) => (manifest.packages?.[id] ?? DEFAULT_RUNTIME_PACKAGES[id]).components) : ['blender', 'ffmpeg']);
  let blender: OpenedPack['blender'] = null;
  if (wanted.has('blender')) {
    const blenderArt = selectArtifact(manifest, platformKey);
    const path = join(workDir, 'blender', artifactFileName(blenderArt));
    await verifyFile(path, blenderArt, 'Blender');
    blender = { artifact: blenderArt, path };
  }
  const ffArt = wanted.has('ffmpeg') ? selectFfmpegArtifact(manifest, platformKey) : null;
  let ffmpeg: OpenedPack['ffmpeg'] = null;
  if (ffArt) {
    const path = join(workDir, 'ffmpeg', artifactFileName(ffArt));
    await verifyFile(path, ffArt, 'FFmpeg');
    ffmpeg = { artifact: ffArt, path };
  }
  if (!blender && !ffmpeg) throw new AppError('PACK_INVALID', 'gói không chứa thành phần nào');
  return { manifest, blender, ffmpeg };
}
