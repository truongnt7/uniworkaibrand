/**
 * Chính sách giấy phép FFmpeg (quyết định: chỉ phân phối bản LGPL).
 * Mọi hàm ở đây thuần (không chạy tiến trình) để test được; phần chạy `ffmpeg -version/-buildconf/-encoders` nằm ở app.
 */

/** Encoder H.264 được phép dùng. libx264/libx265 (GPL) bị cấm vĩnh viễn. */
export const ALLOWED_H264_ENCODERS = ['libopenh264', 'h264_videotoolbox', 'h264_nvenc', 'h264_amf', 'h264_qsv'] as const;
export type AllowedH264Encoder = (typeof ALLOWED_H264_ENCODERS)[number];

/** Cờ configure biến binary thành GPL / không phân phối lại được. */
export const FORBIDDEN_CONFIGURE_FLAGS = ['--enable-gpl', '--enable-nonfree'] as const;

/** Thư viện GPL-only: nếu bật thì cả binary là GPL dù không có `--enable-gpl` (configure sẽ chặn, kiểm thêm cho chắc). */
export const GPL_LIBRARIES = [
  'libx264',
  'libx265',
  'libxvid',
  'libvidstab',
  'librubberband',
  'libzvbi',
  'libdavs2',
  'libxavs2',
  'frei0r',
  'libcdio',
  'libsmbclient',
  'avisynth',
] as const;

/** Thư viện không tự do (nonfree) thường gặp. */
export const NONFREE_LIBRARIES = ['libfdk-aac', 'libfdk_aac', 'decklink', 'libnpp', 'libtls'] as const;

export interface FfmpegLicenseReport {
  ok: boolean;
  violations: string[];
  /** FFmpeg chạy ở LGPLv3 (`--enable-version3`): vẫn là LGPL nhưng cần ghi vào THIRD_PARTY_NOTICES. */
  version3: boolean;
  version: string | null;
  enabledLibraries: string[];
}

export interface FfmpegProbe {
  /** Toàn bộ stdout của `ffmpeg -version` (có dòng `configuration:`). */
  versionOutput: string;
  /** Stdout của `ffmpeg -buildconf` (tùy chọn; dùng khi có). */
  buildconfOutput?: string;
  /** Stdout của `ffmpeg -L` (văn bản giấy phép), tùy chọn. */
  licenseOutput?: string;
  /** Tên encoder có trong binary (từ `ffmpeg -encoders`), tùy chọn. */
  encoders?: readonly string[];
}

export function parseConfigureFlags(output: string): string[] {
  const flags = new Set<string>();
  for (const line of output.split('\n')) {
    const text = line.trim().replace(/^configuration:\s*/, '');
    for (const tok of text.match(/--[a-z0-9][a-z0-9-_]*(?:=\S+)?/gi) ?? []) flags.add(tok.replace(/=.*/, ''));
  }
  return [...flags];
}

export function evaluateFfmpegLicense(probe: FfmpegProbe): FfmpegLicenseReport {
  const violations: string[] = [];
  const all = `${probe.versionOutput}\n${probe.buildconfOutput ?? ''}`;
  const flags = parseConfigureFlags(all);
  if (!/^configuration:/m.test(probe.versionOutput) && !probe.buildconfOutput) {
    violations.push('không đọc được dòng "configuration:" của ffmpeg (không thể xác minh giấy phép)');
  }
  for (const f of FORBIDDEN_CONFIGURE_FLAGS) if (flags.includes(f)) violations.push(`binary bật ${f}`);
  const enabled = flags.filter((f) => f.startsWith('--enable-')).map((f) => f.slice('--enable-'.length));
  for (const lib of GPL_LIBRARIES) if (enabled.includes(lib)) violations.push(`binary bật thư viện GPL: ${lib}`);
  for (const lib of NONFREE_LIBRARIES) if (enabled.includes(lib)) violations.push(`binary bật thư viện nonfree: ${lib}`);
  if (probe.licenseOutput !== undefined && !/GNU Lesser General Public License/i.test(probe.licenseOutput)) {
    violations.push('`ffmpeg -L` không báo giấy phép LGPL');
  }
  for (const enc of probe.encoders ?? []) {
    if (enc === 'libx264' || enc === 'libx264rgb' || enc === 'libx265') violations.push(`binary có encoder GPL: ${enc}`);
  }
  const version = /^ffmpeg version (\S+)/m.exec(probe.versionOutput)?.[1] ?? null;
  return { ok: violations.length === 0, violations, version3: flags.includes('--enable-version3'), version, enabledLibraries: enabled };
}

export function parseEncoderNames(encodersOutput: string): string[] {
  const names: string[] = [];
  for (const line of encodersOutput.split('\n')) {
    const m = /^\s*V[.A-Z]{5}\s+(\S+)/.exec(line);
    if (m?.[1]) names.push(m[1]);
  }
  return names;
}

/** Thứ tự ưu tiên encoder theo nền tảng (chỉ trong danh sách cho phép). macOS: VideoToolbox trước. */
export function encoderPreference(platform: string): AllowedH264Encoder[] {
  return platform === 'darwin'
    ? ['h264_videotoolbox', 'libopenh264']
    : ['libopenh264', 'h264_nvenc', 'h264_amf', 'h264_qsv'];
}

export function chooseEncoder(available: readonly string[], platform: string): AllowedH264Encoder | null {
  return encoderPreference(platform).find((e) => available.includes(e)) ?? null;
}

export function isAllowedEncoder(codec: string): codec is AllowedH264Encoder {
  return (ALLOWED_H264_ENCODERS as readonly string[]).includes(codec);
}
