#!/usr/bin/env node
/**
 * Rút gọn Blender (P0-08): xóa các phần KHÔNG cần cho render headless bằng Cycles/EEVEE + nhập glTF, rồi in tổng dung lượng giảm được.
 * Chỉ xóa theo danh sách tường minh dưới đây; KHÔNG đụng thư viện GPU (CUDA/OptiX/HIP/oneAPI/Metal), cycles, io_scene_gltf2.
 *
 *   node tools/runtime/slim-blender.mjs --src <thư mục blender đã giải nén> --dst <thư mục đích> [--dry-run]
 *
 * Sau khi rút gọn phải chạy so ảnh với bản đầy đủ: node tools/runtime/compare-slim.mjs (xem docs/ops/blender-slimming.md).
 */
import { cpSync, existsSync, lstatSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { src: { type: 'string' }, dst: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } });
if (!values.src || !values.dst) throw new Error('dùng: --src <blender> --dst <đích>');
const src = resolve(values.src);
const dst = resolve(values.dst);

function size(p) {
  const st = lstatSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((a, n) => a + size(join(p, n)), 0);
}

const ver = readdirSync(src).find((n) => /^\d+\.\d+$/.test(n));
if (!ver) throw new Error('không thấy thư mục phiên bản (vd 4.5) trong ' + src);
const v = (p) => join(ver, p);

const REMOVE = [
  [v('datafiles/locale'), 'bản dịch giao diện (headless không dùng)'],
  [v('datafiles/studiolights'), 'studio light của viewport'],
  [v('scripts/templates_py'), 'template script'],
  [v('scripts/templates_osl'), 'template OSL'],
  [v('scripts/templates_toml'), 'template'],
  [v('scripts/addons_core/rigify'), 'add-on rigging'],
  [v('scripts/addons_core/io_scene_fbx'), 'nhập/xuất FBX'],
  [v('scripts/addons_core/io_curve_svg'), 'nhập SVG'],
  [v('scripts/addons_core/io_mesh_uv_layout'), 'xuất UV layout'],
  [v('scripts/addons_core/node_wrangler'), 'tiện ích node editor'],
  [v('scripts/addons_core/pose_library'), 'pose library'],
  [v('scripts/addons_core/viewport_vr_preview'), 'VR preview'],
  [v('scripts/addons_core/ui_translate'), 'công cụ dịch UI'],
  [v('python/lib/python3.11/site-packages/Cython'), 'Cython'],
  [v('python/lib/python3.11/site-packages/cython.py'), 'Cython'],
  [v('python/lib/python3.11/site-packages/autopep8.py'), 'autopep8'],
  [v('python/lib/python3.11/config-3.11-x86_64-linux-gnu'), 'static libpython (chỉ để biên dịch)'],
  [v('python/lib/python3.11/ensurepip'), 'ensurepip'],
  ['readme.html', 'tài liệu'],
  ['blender.svg', 'icon desktop'],
  ['blender-symbolic.svg', 'icon desktop'],
  ['blender.desktop', 'desktop entry'],
  ['blender-thumbnailer', 'thumbnailer'],
];

const before = size(src);
const plan = REMOVE.filter(([p]) => existsSync(join(src, p))).map(([p, why]) => ({ path: p, why, bytes: size(join(src, p)) }));
if (!values['dry-run']) {
  rmSync(dst, { recursive: true, force: true });
  cpSync(src, dst, { recursive: true, verbatimSymlinks: true });
  for (const r of plan) rmSync(join(dst, r.path), { recursive: true, force: true });
}
const saved = plan.reduce((a, r) => a + r.bytes, 0);
const mb = (n) => Math.round(n / 1048576);
for (const r of plan) console.log(`  -${String(mb(r.bytes)).padStart(4)} MB  ${r.path}  (${r.why})`);
console.log(`Trước: ${mb(before)} MB | giảm: ${mb(saved)} MB (${((saved / before) * 100).toFixed(1)}%) | sau: ${mb(before - saved)} MB`);
console.log(JSON.stringify({ beforeBytes: before, savedBytes: saved, afterBytes: before - saved, removed: plan }));
