import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RuntimeManifest } from '@aps/shared';
import { ReleaseManifestSchema } from '../../src/runtime/manifest.schema';
import defaultManifest from '../../src/runtime/default-manifest.json';

describe('manifest runtime mặc định', () => {
  it('hợp lệ theo schema của API và theo schema desktop (@aps/shared)', () => {
    expect(ReleaseManifestSchema.safeParse(defaultManifest).success).toBe(true);
    expect(RuntimeManifest.safeParse(defaultManifest).success).toBe(true);
  });

  it('phần Blender trùng với tools/runtime/manifest.json của PoC (không lệch URL/sha256)', () => {
    const poc = JSON.parse(readFileSync(join(__dirname, '../../../../tools/runtime/manifest.json'), 'utf8'));
    expect(defaultManifest.blender).toEqual(poc.blender);
  });

  it('khóa cứng Blender 4.5 LTS và ffmpeg LGPL', () => {
    const base = JSON.parse(JSON.stringify(defaultManifest));
    expect(ReleaseManifestSchema.safeParse({ ...base, blender: { ...base.blender, version: '4.4.3' } }).success).toBe(false);
    expect(ReleaseManifestSchema.safeParse({ ...base, blender: { ...base.blender, version: '5.0.1' } }).success).toBe(false);
    expect(ReleaseManifestSchema.safeParse({ ...base, blender: { ...base.blender, channel: 'stable' } }).success).toBe(false);
    expect(ReleaseManifestSchema.safeParse({ ...base, ffmpeg: { ...base.ffmpeg, license: 'GPL-3.0-or-later' } }).success).toBe(false);
    expect(ReleaseManifestSchema.safeParse({ ...base, ffmpeg: undefined }).success).toBe(false);
  });
});
