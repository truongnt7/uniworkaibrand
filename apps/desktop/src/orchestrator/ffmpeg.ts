import { AppError } from '@aps/shared';
import { chooseEncoder, evaluateFfmpegLicense, parseEncoderNames, type AllowedH264Encoder, type FfmpegLicenseReport } from '@aps/render-core';
import { runProcess } from './process.js';

async function capture(bin: string, args: string[]): Promise<string> {
  let out = '';
  const r = await runProcess(bin, args, { onStdoutChunk: (c) => (out += c.toString('utf8')) }).catch((e: NodeJS.ErrnoException) => {
    throw new AppError(e.code === 'ENOENT' ? 'FFMPEG_MISSING' : 'FFMPEG_FAILED', `không chạy được ffmpeg: ${e.message}`);
  });
  if (r.code !== 0) throw new AppError('FFMPEG_FAILED', `ffmpeg ${args.join(' ')} thoát với mã ${r.code}`);
  return out;
}

export interface FfmpegInspection {
  report: FfmpegLicenseReport;
  encoders: string[];
  encoder: AllowedH264Encoder | null;
}

/** Chạy `-version`, `-buildconf`, `-L`, `-encoders` và đánh giá theo chính sách LGPL. */
export async function inspectFfmpeg(path: string, platform: string = process.platform): Promise<FfmpegInspection> {
  const versionOutput = await capture(path, ['-hide_banner', '-version']);
  const buildconfOutput = await capture(path, ['-hide_banner', '-buildconf']).catch(() => '');
  const licenseOutput = await capture(path, ['-hide_banner', '-L']).catch(() => undefined);
  const encoders = parseEncoderNames(await capture(path, ['-hide_banner', '-encoders']));
  const report = evaluateFfmpegLicense({ versionOutput, buildconfOutput, ...(licenseOutput !== undefined ? { licenseOutput } : {}), encoders });
  return { report, encoders, encoder: chooseEncoder(encoders, platform) };
}

const cache = new Map<string, Promise<FfmpegInspection>>();

/**
 * Chốt chặn giấy phép: từ chối binary bật --enable-gpl/--enable-nonfree hoặc thư viện GPL, rồi chọn encoder H.264 được phép.
 * Kết quả được nhớ theo đường dẫn cho tới khi tiến trình kết thúc (binary đã cài không đổi giữa các job).
 */
export function assertLgplFfmpeg(path: string, platform?: string): Promise<FfmpegInspection & { encoder: AllowedH264Encoder }> {
  let pending = cache.get(path);
  if (!pending) {
    pending = inspectFfmpeg(path, platform);
    cache.set(path, pending);
    pending.catch(() => cache.delete(path));
  }
  return pending.then((i) => {
    if (!i.report.ok) {
      throw new AppError('FFMPEG_LICENSE_VIOLATION', `ffmpeg không đạt chính sách LGPL: ${i.report.violations.join('; ')}`, { violations: i.report.violations });
    }
    if (!i.encoder) {
      throw new AppError('FFMPEG_NO_ALLOWED_ENCODER', `ffmpeg không có encoder H.264 được phép (có: ${i.encoders.filter((e) => /264|vp9|av1/.test(e)).join(', ') || 'không'})`);
    }
    return { ...i, encoder: i.encoder };
  });
}

export function resetFfmpegInspectionCache(): void {
  cache.clear();
}
