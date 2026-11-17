#!/usr/bin/env node
// Đóng gói runtime offline (P0-07): 1 file `.apspack` = tar không nén gồm
//   pack.json            { format, platform, manifest: <manifest ĐÃ KÝ> }
//   blender/<archive>    đúng archive Blender trong manifest
//   ffmpeg/<archive>     đúng archive FFmpeg LGPL trong manifest
// Không cần khóa riêng: tin cậy đến từ chữ ký trong manifest; app kiểm chữ ký + sha256 từng thành phần khi nhập.
//   node tools/runtime/pack-runtime.mjs --signed-manifest apps/desktop/resources/runtime-manifest.signed.json \
//        --platform linux-x64 --out dist/aps-runtime-linux-x64.apspack [--cache .cache/runtime]
//        [--blender-archive <file>] [--ffmpeg-archive <file>]     # dùng file có sẵn thay vì tải (vẫn kiểm sha256)
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { die, downloadVerified, parseArgs, repoRoot, sha256File, tar } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const need = (k) => (args[k] && args[k] !== true ? args[k] : die(`thiếu --${k}`));
const signed = JSON.parse(readFileSync(need('signed-manifest'), 'utf8'));
const platform = need('platform');
const out = resolve(need('out'));
const cache = resolve(args.cache && args.cache !== true ? args.cache : join(repoRoot, '.cache', 'runtime'));
const manifest = JSON.parse(signed.manifest);
if (!manifest.ffmpeg) die('manifest thiếu ffmpeg');
const blender = manifest.blender.artifacts[platform] ?? die(`manifest không có Blender cho ${platform}`);
const ffmpeg = manifest.ffmpeg.artifacts[platform] ?? die(`manifest không có FFmpeg cho ${platform}`);

const stage = mkdtempSync(join(tmpdir(), 'aps-pack-'));
try {
  for (const [dir, art, local] of [
    ['blender', blender, args['blender-archive']],
    ['ffmpeg', ffmpeg, args['ffmpeg-archive']],
  ]) {
    const name = basename(new URL(art.url).pathname);
    mkdirSync(join(stage, dir), { recursive: true });
    let src;
    if (local && local !== true) {
      src = resolve(local);
      if (statSync(src).size !== art.size || (await sha256File(src)) !== art.sha256) die(`${local} không khớp size/sha256 trong manifest`);
    } else {
      console.log(`Tải ${name} (${(art.size / 1e6).toFixed(0)} MB)...`);
      src = await downloadVerified(art.url, join(cache, name), art);
    }
    copyFileSync(src, join(stage, dir, name));
  }
  writeFileSync(join(stage, 'pack.json'), JSON.stringify({ format: 1, platform, manifest: signed }));
  mkdirSync(resolve(out, '..'), { recursive: true });
  tar(['-cf', out, '-C', stage, 'pack.json', 'blender', 'ffmpeg']);
  console.log(`Đã tạo ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB; Blender ${blender.size} B + FFmpeg ${ffmpeg.size} B)`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
