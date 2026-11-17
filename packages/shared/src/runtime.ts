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

export const RuntimeManifest = z.object({
  schemaVersion: z.literal(1),
  blender: z.object({
    version: z.string().regex(/^4\.5\.\d+$/),
    channel: z.literal('LTS'),
    artifacts: z.record(z.string(), RuntimeArtifact),
  }),
});
export type RuntimeManifest = z.infer<typeof RuntimeManifest>;

export const SignedManifest = z.object({
  manifest: z.string(),
  /** Chữ ký ed25519 (base64) trên chuỗi `manifest` đúng từng byte. */
  signature: z.string(),
  keyId: z.string().optional(),
});
export type SignedManifest = z.infer<typeof SignedManifest>;

export const RUNTIME_ERROR_CODES = [
  'MANIFEST_INVALID',
  'MANIFEST_SIGNATURE_INVALID',
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

export const RuntimeStatus = z.object({
  installed: z.boolean(),
  version: z.string().nullable(),
  binaryPath: z.string().nullable(),
  platform: z.string(),
  busy: z.boolean(),
});
export type RuntimeStatus = z.infer<typeof RuntimeStatus>;

export const RuntimeProgress = z.object({
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
