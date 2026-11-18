import { z } from 'zod';

export const RuntimePlatformKey = z.enum(['linux-x64', 'linux-arm64', 'win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64']);
export type RuntimePlatformKey = z.infer<typeof RuntimePlatformKey>;

export const ArchiveType = z.enum(['tar.xz', 'zip', 'dmg']);
export type ArchiveType = z.infer<typeof ArchiveType>;

export const RuntimeArtifact = z.object({
  url: z.string().url(),
  mirrors: z.array(z.string().url()).default([]),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  archive: ArchiveType,
  /** Dung lượng ước tính sau giải nén, dùng để kiểm tra chỗ trống trên đĩa. */
  extractedSize: z.number().int().positive().optional(),
  /** Đường dẫn tới binary Blender, tương đối so với thư mục đã giải nén. */
  binary: z.string(),
});
export type RuntimeArtifact = z.infer<typeof RuntimeArtifact>;

/** FFmpeg phân phối kèm app: chỉ chấp nhận bản LGPL (không `--enable-gpl`, không `--enable-nonfree`). */
export const FfmpegComponent = z.object({
  version: z.string().min(1),
  license: z.literal('LGPL-3.0-or-later'),
  /** Nơi lấy mã nguồn tương ứng của đúng bản binary (nghĩa vụ LGPL). */
  sourceUrl: z.string().url(),
  artifacts: z.record(z.string(), RuntimeArtifact),
});
export type FfmpegComponent = z.infer<typeof FfmpegComponent>;

/** Thành phần tải về (mỗi thành phần là một archive trong manifest). */
export const RuntimeComponentId = z.enum(['ffmpeg', 'blender']);
export type RuntimeComponentId = z.infer<typeof RuntimeComponentId>;

/**
 * Gói runtime là đơn vị app tải theo nhu cầu: `ffmpeg` (nhẹ, đủ cho ảnh sang video) và `blender` (chỉ video 3D).
 * `requires` là gói phải có trước (video 3D vẫn ghép khung bằng ffmpeg nên gói blender cần gói ffmpeg).
 */
export const RuntimePackageId = z.enum(['ffmpeg', 'blender']);
export type RuntimePackageId = z.infer<typeof RuntimePackageId>;

export const RuntimePackageSpec = z.object({
  components: z.array(RuntimeComponentId).min(1),
  requires: z.array(RuntimePackageId).default([]),
});
export type RuntimePackageSpec = z.infer<typeof RuntimePackageSpec>;

/** Mặc định khi manifest (ký) cũ không có mục `packages`: cùng ý nghĩa với phân tách ffmpeg/blender hiện có. */
export const DEFAULT_RUNTIME_PACKAGES: Record<RuntimePackageId, RuntimePackageSpec> = {
  ffmpeg: { components: ['ffmpeg'], requires: [] },
  blender: { components: ['blender'], requires: ['ffmpeg'] },
};

export const RuntimeManifest = z.object({
  schemaVersion: z.literal(1),
  blender: z.object({
    version: z.string().regex(/^4\.5\.\d+$/),
    channel: z.literal('LTS'),
    artifacts: z.record(z.string(), RuntimeArtifact),
  }),
  ffmpeg: FfmpegComponent.optional(),
  /** Thêm sau schemaVersion 1 (tùy chọn): gói nào gồm thành phần nào. Nằm trong phần được ký của manifest. */
  packages: z
    .object({
      ffmpeg: RuntimePackageSpec.optional(),
      blender: RuntimePackageSpec.optional(),
    })
    .superRefine((p, ctx) => {
      if (p.ffmpeg && !p.ffmpeg.components.every((c) => c === 'ffmpeg')) ctx.addIssue({ code: 'custom', message: 'gói ffmpeg chỉ được chứa thành phần ffmpeg' });
      if (p.ffmpeg && p.ffmpeg.requires.length > 0) ctx.addIssue({ code: 'custom', message: 'gói ffmpeg không được yêu cầu gói khác' });
      if (p.blender && !p.blender.components.includes('blender')) ctx.addIssue({ code: 'custom', message: 'gói blender phải chứa thành phần blender' });
      if (p.blender && p.blender.requires.some((r) => r !== 'ffmpeg')) ctx.addIssue({ code: 'custom', message: 'gói blender chỉ được yêu cầu gói ffmpeg' });
    })
    .optional(),
});
export type RuntimeManifest = z.infer<typeof RuntimeManifest>;

export const SignedManifest = z.object({
  manifest: z.string(),
  /** Chữ ký ed25519 (base64) trên chuỗi `manifest` đúng từng byte. */
  signature: z.string(),
  keyId: z.string().optional(),
});
export type SignedManifest = z.infer<typeof SignedManifest>;

/** Các thành phần cần có cho một gói (kể cả gói nó yêu cầu), theo thứ tự cài: gói yêu cầu trước. */
export function runtimePackageComponents(
  manifest: Pick<RuntimeManifest, 'packages'>,
  id: RuntimePackageId,
  seen: RuntimePackageId[] = [],
): RuntimeComponentId[] {
  if (seen.includes(id)) return [];
  const spec = manifest.packages?.[id] ?? DEFAULT_RUNTIME_PACKAGES[id];
  const out: RuntimeComponentId[] = [];
  for (const r of spec.requires) for (const c of runtimePackageComponents(manifest, r, [...seen, id])) if (!out.includes(c)) out.push(c);
  for (const c of spec.components) if (!out.includes(c)) out.push(c);
  return out;
}

export const RUNTIME_ERROR_CODES = [
  'MANIFEST_INVALID',
  'MANIFEST_SIGNATURE_INVALID',
  'MANIFEST_NO_TRUSTED_KEY',
  'MANIFEST_UNTRUSTED_KEY',
  'FFMPEG_LICENSE_VIOLATION',
  'FFMPEG_NO_ALLOWED_ENCODER',
  'PACK_INVALID',
  'PLATFORM_UNSUPPORTED',
  'NETWORK',
  'HTTP_STATUS',
  'CHECKSUM_MISMATCH',
  'SIZE_MISMATCH',
  'DISK_SPACE',
  'EXTRACT_FAILED',
  'SMOKE_TEST_FAILED',
  'ACTIVATE_FAILED',
  'CANCELED',
] as const;
export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export const RuntimePackageStatus = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
});
export type RuntimePackageStatus = z.infer<typeof RuntimePackageStatus>;

export const RuntimeStatus = z.object({
  /** Blender đã cài (giữ nguyên nghĩa cũ). */
  installed: z.boolean(),
  version: z.string().nullable(),
  binaryPath: z.string().nullable(),
  ffmpegPath: z.string().nullable().default(null),
  platform: z.string(),
  busy: z.boolean(),
  /** Thêm sau: trạng thái từng gói; `blender` = Blender đã cài, `ffmpeg` = FFmpeg đã cài. */
  packages: z.object({ ffmpeg: RuntimePackageStatus, blender: RuntimePackageStatus }).optional(),
});
export type RuntimeStatus = z.infer<typeof RuntimeStatus>;

export const RuntimeInstallReq = z
  .object({
    /** Gói cần cài; bỏ trống = tất cả (cách cũ). App chỉ nên yêu cầu gói đang cần. */
    packages: z.array(RuntimePackageId).min(1).max(2).optional(),
  })
  .strict();
export type RuntimeInstallReq = z.infer<typeof RuntimeInstallReq>;

export const RuntimeProgress = z.object({
  component: z.enum(['blender', 'ffmpeg']).default('blender'),
  /** Thêm sau: bước hiện tại / tổng số bước tải (mỗi thành phần cần cài là một bước). */
  step: z.number().int().min(0).optional(),
  steps: z.number().int().min(0).optional(),
  phase: z.enum(['downloading', 'verifying', 'extracting', 'smoke-test', 'activating', 'done', 'error', 'retrying']),
  receivedBytes: z.number().min(0).default(0),
  totalBytes: z.number().min(0).default(0),
  bytesPerSecond: z.number().min(0).default(0),
  attempt: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(0).default(0),
  errorCode: z.string().optional(),
  message: z.string().optional(),
});
export type RuntimeProgress = z.infer<typeof RuntimeProgress>;
