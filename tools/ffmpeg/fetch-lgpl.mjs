#!/usr/bin/env node
// Tải đúng binary FFmpeg LGPL đã ghim trong tools/runtime/manifest.json, kiểm sha256, giải nén, in đường dẫn binary.
//   node tools/ffmpeg/fetch-lgpl.mjs [--platform linux-x64] [--out .cache/ffmpeg]
// Sau đó: pnpm --filter @aps/desktop verify:ffmpeg <binary>  (kiểm --enable-gpl/--enable-nonfree...)
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { die, downloadVerified, parseArgs, repoRoot, tar } from '../runtime/lib.mjs';

const args = parseArgs(process.argv.slice(2));
const platform = args.platform && args.platform !== true ? args.platform : `${process.platform}-${process.arch}`;
const out = resolve(args.out && args.out !== true ? args.out : join(repoRoot, '.cache', 'ffmpeg'));
const manifest = JSON.parse(readFileSync(join(repoRoot, 'tools', 'runtime', 'manifest.json'), 'utf8'));
const art = manifest.ffmpeg?.artifacts?.[platform] ?? die(`không có ffmpeg LGPL ghim cho ${platform}`);
const archive = await downloadVerified(art.url, join(out, basename(new URL(art.url).pathname)), art);
const binary = join(out, art.binary);
if (!existsSync(binary)) {
  mkdirSync(out, { recursive: true });
  tar(art.archive === 'zip' && process.platform !== 'win32' ? ['-xf', archive, '-C', out] : ['-xf', archive, '-C', out]);
}
console.log(binary);
