#!/usr/bin/env node
// Đóng gói runtime offline: 1 file `.apspack` = tar không nén gồm
//   pack.json            { format, platform, manifest: <manifest ĐÃ KÝ>, packages: [...] }
//   ffmpeg/<archive>     archive FFmpeg LGPL trong manifest (gói `ffmpeg`, nhẹ, đủ cho ảnh sang video)
//   blender/<archive>    archive Blender trong manifest (gói `blender`, chỉ cần cho video 3D)
// Không cần khóa riêng: tin cậy đến từ chữ ký trong manifest; app kiểm chữ ký + sha256 từng thành phần khi nhập.
//   node tools/runtime/pack-runtime.mjs --signed-manifest apps/desktop/resources/runtime-manifest.signed.json \
//        --platform linux-x64 --out dist/aps-runtime-linux-x64.apspack [--cache .cache/runtime]
//        [--packages ffmpeg,blender]                               # mặc định cả hai; `--packages ffmpeg` cho gói nhẹ
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
const packages = (args.packages && args.packages !== true ? String(args.packages) : 'ffmpeg,blender').split(',').map((s) => s.trim()).filter(Boolean);
for (const p of packages) if (!['ffmpeg', 'blender'].includes(p)) die(`gói không hợp lệ: ${p} (chỉ có ffmpeg, blender)`);
if (new Set(packages).size !== packages.length || packages.length === 0) die('--packages phải là danh sách không trùng, ví dụ ffmpeg,blender');

const manifest = JSON.parse(signed.manifest);
if (!manifest.ffmpeg) die('manifest thiếu ffmpeg');
const DEFAULTS = { ffmpeg: { components: ['ffmpeg'] }, blender: { components: ['blender'] } };
const components = [...new Set(packages.flatMap((p) => (manifest.packages?.[p] ?? DEFAULTS[p]).components))];

const parts = [];
if (components.includes('ffmpeg')) {
  parts.push(['ffmpeg', manifest.ffmpeg.artifacts[platform] ?? die(`manifest không có FFmpeg cho ${platform}`), args['ffmpeg-archive']]);
}
if (components.includes('blender')) {
  parts.push(['blender', manifest.blender.artifacts[platform] ?? die(`manifest không có Blender cho ${platform}`), args['blender-archive']]);
}

const stage = mkdtempSync(join(tmpdir(), 'aps-pack-'));
try {
  for (const [dir, art, local] of parts) {
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
  writeFileSync(join(stage, 'pack.json'), JSON.stringify({ format: 1, platform, manifest: signed, packages }));
  mkdirSync(resolve(out, '..'), { recursive: true });
  tar(['-cf', out, '-C', stage, 'pack.json', ...parts.map(([d]) => d)]);
  console.log(`Đã tạo ${out} (${(statSync(out).size / 1e6).toFixed(1)} MB; gói ${packages.join(' + ')}: ${parts.map(([d, a]) => `${d} ${a.size} B`).join(', ')})`);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
