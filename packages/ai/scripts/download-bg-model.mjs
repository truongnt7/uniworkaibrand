#!/usr/bin/env node
// Tải model tách nền vào packages/ai/models (không commit), kiểm sha256.
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS = {
  u2netp: {
    file: 'u2netp.onnx',
    url: 'https://github.com/danielgatis/rembg/releases/download/v0.0.0/u2netp.onnx',
    sha256: '309c8469258dda742793dce0ebea8e6dd393174f89934733ecc8b14c76f4ddd8',
  },
  'birefnet-lite': {
    file: 'birefnet_lite.onnx',
    url: 'https://huggingface.co/onnx-community/BiRefNet_lite-ONNX/resolve/main/onnx/model.onnx',
    sha256: '5600024376f572a557870a5eb0afb1e5961636bef4e1e22132025467d0f03333',
  },
};

const id = process.argv[2] ?? 'u2netp';
const spec = MODELS[id];
if (!spec) {
  console.error(`Model không hợp lệ: ${id}. Chọn: ${Object.keys(MODELS).join(', ')}`);
  process.exit(2);
}
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../models');
mkdirSync(dir, { recursive: true });
const dest = path.join(dir, spec.file);
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

if (existsSync(dest) && sha(dest) === spec.sha256) {
  console.log(`Đã có và đúng sha256: ${dest}`);
  process.exit(0);
}
const tmp = `${dest}.part`;
const res = await fetch(spec.url, { redirect: 'follow' });
if (!res.ok || !res.body) {
  console.error(`Tải lỗi HTTP ${res.status}`);
  process.exit(1);
}
await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
if (sha(tmp) !== spec.sha256) {
  rmSync(tmp, { force: true });
  console.error('sha256 không khớp, đã xoá file tải về');
  process.exit(1);
}
renameSync(tmp, dest);
console.log(`Đã tải ${dest}`);
