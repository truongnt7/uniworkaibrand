import { z } from 'zod';

/**
 * Hình dạng manifest tương thích với `RuntimeManifest` trong @aps/shared (desktop):
 * schemaVersion + blender{version,channel,artifacts}. Phần `ffmpeg` và `environment`/`releaseId`
 * là phần mở rộng; desktop bỏ qua khóa lạ nên vẫn đọc được.
 */
export const PLATFORM_KEYS = ['linux-x64', 'linux-arm64', 'win32-x64', 'win32-arm64', 'darwin-x64', 'darwin-arm64'] as const;

export const ArtifactSchema = z.object({
  url: z.string().url(),
  mirrors: z.array(z.string().url()).default([]),
  size: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/, 'sha256 phải là 64 ký tự hex thường'),
  archive: z.enum(['tar.xz', 'zip', 'dmg']),
  extractedSize: z.number().int().positive().optional(),
  binary: z.string().min(1),
});

const artifactsOf = () =>
  z.record(z.string(), ArtifactSchema).superRefine((rec, ctx) => {
    for (const k of Object.keys(rec)) {
      if (!(PLATFORM_KEYS as readonly string[]).includes(k)) ctx.addIssue({ code: 'custom', message: `nền tảng không hỗ trợ: ${k}`, path: [k] });
    }
  });

/** Nội dung do admin phát hành (chưa gồm environment/releaseId do server đóng dấu khi ký). */
export const ReleaseManifestSchema = z.object({
  schemaVersion: z.literal(1),
  blender: z.object({
    // Khóa cứng Blender 4.5 LTS (quyết định D1); nâng cấp = đổi regex sau khi qua bộ kiểm thử render/QC.
    version: z.string().regex(/^4\.5\.\d+$/, 'chỉ chấp nhận Blender 4.5.x LTS'),
    channel: z.literal('LTS'),
    artifacts: artifactsOf(),
  }),
  ffmpeg: z.object({
    version: z.string().min(1),
    // Chỉ cho phép bản build LGPL; bản GPL phải đi qua rà soát giấy phép riêng.
    license: z.enum(['LGPL-2.1-or-later', 'LGPL-3.0-or-later']),
    artifacts: artifactsOf(),
  }),
});
export type ReleaseManifest = z.infer<typeof ReleaseManifestSchema>;

export interface ServedManifest extends ReleaseManifest {
  environment: 'development' | 'production';
  releaseId: string;
}
