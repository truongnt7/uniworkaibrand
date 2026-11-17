import { describe, expect, it } from 'vitest';
import { chooseEncoder, evaluateFfmpegLicense, parseConfigureFlags, parseEncoderNames } from '../src/index.js';

const LGPL = `ffmpeg version n8.1.3-35-gf1acb0a266-20261116 Copyright (c) 2000-2026 the FFmpeg developers
built with gcc 16.2.0
configuration: --prefix=/ffbuild/prefix --enable-version3 --enable-libopenh264 --enable-libaom --disable-libx264 --disable-libx265 --enable-libsvtav1 --disable-libxvid
libavutil      60. 26.103 / 60. 26.103`;

const GPL = `ffmpeg version 6.1.1-3ubuntu5 Copyright (c) 2000-2023 the FFmpeg developers
configuration: --prefix=/usr --enable-gpl --enable-libx264 --enable-libx265`;

describe('chính sách giấy phép FFmpeg', () => {
  it('chấp nhận bản LGPL (--disable-libx264 không bị nhầm là bật)', () => {
    const r = evaluateFfmpegLicense({ versionOutput: LGPL, licenseOutput: 'FFmpeg is free software; ... GNU Lesser General Public License' });
    expect(r).toMatchObject({ ok: true, violations: [], version3: true, version: 'n8.1.3-35-gf1acb0a266-20261116' });
    expect(r.enabledLibraries).toContain('libopenh264');
  });

  it('từ chối --enable-gpl và thư viện GPL', () => {
    const r = evaluateFfmpegLicense({ versionOutput: GPL });
    expect(r.ok).toBe(false);
    expect(r.violations).toEqual(expect.arrayContaining(['binary bật --enable-gpl', 'binary bật thư viện GPL: libx264', 'binary bật thư viện GPL: libx265']));
  });

  it('từ chối --enable-nonfree và libfdk-aac', () => {
    const r = evaluateFfmpegLicense({ versionOutput: 'ffmpeg version 7\nconfiguration: --enable-nonfree --enable-libfdk-aac' });
    expect(r.violations).toEqual(expect.arrayContaining(['binary bật --enable-nonfree', 'binary bật thư viện nonfree: libfdk-aac']));
  });

  it('từ chối khi không đọc được cấu hình (không thể xác minh) hoặc có encoder GPL', () => {
    expect(evaluateFfmpegLicense({ versionOutput: 'ffmpeg version 7' }).ok).toBe(false);
    expect(evaluateFfmpegLicense({ versionOutput: LGPL, encoders: ['libx264'] }).ok).toBe(false);
  });

  it('-L báo GPL thì từ chối', () => {
    const r = evaluateFfmpegLicense({ versionOutput: LGPL, licenseOutput: 'FFmpeg is free software; ... under the terms of the GNU General Public License' });
    expect(r.ok).toBe(false);
  });

  it('đọc cờ configure và danh sách encoder; chọn encoder theo nền tảng', () => {
    expect(parseConfigureFlags(LGPL)).toEqual(expect.arrayContaining(['--enable-version3', '--disable-libx264']));
    const names = parseEncoderNames(' V....D libopenh264          OpenH264\n V..... h264_qsv   QSV\n A....D aac AAC');
    expect(names).toEqual(['libopenh264', 'h264_qsv']);
    expect(chooseEncoder(names, 'linux')).toBe('libopenh264');
    expect(chooseEncoder(['h264_videotoolbox', 'libopenh264'], 'darwin')).toBe('h264_videotoolbox');
    expect(chooseEncoder(['libx264'], 'linux')).toBeNull();
  });
});
