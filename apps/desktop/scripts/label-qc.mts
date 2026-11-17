/**
 * QC nhãn (P0-09): render vòng xoay 360° ở độ phân giải thấp, lấy lưới chiếu nhãn từ worker, nắn phẳng vùng nhãn rồi
 * so với label.png bằng SSIM (+ OCR tesseract nếu có), cảnh báo khi nhãn nghiêng quá ngưỡng đọc được.
 *
 *   pnpm --filter @aps/desktop qc:label --blender <blender> --glb a.glb --label a.png --out out/qc-a
 *
 * Xuất: report.json, ảnh trước/sau cho từng khung (nhãn gốc | nhãn nắn phẳng từ khung render) và 1 contact sheet.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  assessLabelFrame, blenderArgs, centerTiltDeg, hasReadableText, ocrCompareForFrame, QC_DEFAULTS, visibleFraction, decodePng, encodePng, grayToRaster, rectifiedFor, runTesseract,
  summarizeSweep, type FrameQc, type ProjectionGrid, type Raster,
} from '@aps/render-core';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');
const invokedFrom = process.env.INIT_CWD ?? process.cwd();
const abs = (p: string) => resolve(invokedFrom, p);

const { values } = parseArgs({
  options: {
    blender: { type: 'string' },
    glb: { type: 'string' },
    label: { type: 'string' },
    lang: { type: 'string', default: 'eng' },
    angles: { type: 'string', default: '24' },
    width: { type: 'string', default: '1280' },
    height: { type: 'string', default: '720' },
    samples: { type: 'string', default: '8' },
    'label-mode': { type: 'string', default: 'cylinder' },
    'label-width': { type: 'string' },
    'label-height': { type: 'string' },
    'label-bottom': { type: 'string' },
    'label-center': { type: 'string', default: '0' },
    motion: { type: 'string', default: 'spin360' },
    out: { type: 'string' },
    reuse: { type: 'boolean', default: false },
  },
});
for (const k of ['blender', 'glb', 'label', 'out'] as const) if (!values[k]) throw new Error(`thiếu --${k}`);
const out = abs(values.out!);
const framesDir = join(out, 'frames');
if (!values.reuse) rmSync(out, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });
const total = Number(values.angles);
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

const job = {
  version: 1, mode: 'render', jobId: 'qc', qcGrid: true,
  product: {
    glbPath: abs(values.glb!),
    label: {
      imagePath: abs(values.label!), mode: values['label-mode'],
      widthMm: num(values['label-width']), heightMm: num(values['label-height']), bottomMm: num(values['label-bottom']),
      centerDeg: Number(values['label-center']),
    },
  },
  scene: { template: 'studio-soft', backgroundColor: '#e9e4dc', shadow: 0.5 },
  motion: values.motion,
  render: { engine: 'eevee', samples: Number(values.samples), width: Number(values.width), height: Number(values.height), device: 'auto' },
  frames: { total, angleStartDeg: 0, angleSpanDeg: 360 },
  paths: { framesDir, pattern: 'frame_%06d.png' },
};
const jobPath = join(out, 'job.json');
writeFileSync(jobPath, JSON.stringify(job, null, 1));

async function runBlender(): Promise<void> {
  await new Promise<void>((res, rej) => {
    const c = spawn(abs(values.blender!), blenderArgs(join(repoRoot, 'blender-worker', 'worker.py'), jobPath), { stdio: ['ignore', 'pipe', 'inherit'] });
    let buf = '';
    c.stdout.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      for (let i = buf.indexOf('\n'); i >= 0; i = buf.indexOf('\n')) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.startsWith('{') && /"type":"(error|warning)"/.test(line)) console.error(line);
      }
    });
    c.on('error', rej);
    c.on('close', (code) => (code === 0 ? res() : rej(new Error(`blender thoát mã ${code}`))));
  });
}

if (!values.reuse || readdirSync(framesDir).filter((f) => f.endsWith('.png')).length < total) await runBlender();

const labelPng = new Uint8Array(readFileSync(abs(values.label!)));
const label: Raster = decodePng(labelPng);
const ocrAvail = (await runTesseract(join(repoRoot, 'assets/samples/label.png'), { lang: values.lang as string })).available;
const results: Array<FrameQc & { frame: number; angleDeg: number; recognized?: string }> = [];
const tiles: Raster[] = [];
const loadGrid = (i: number) => JSON.parse(readFileSync(join(framesDir, `frame_${String(i).padStart(6, '0')}.png.grid.json`), 'utf8')) as ProjectionGrid;
// OCR nhãn cong rất nhiễu và chậm: chỉ chạy trên tối đa 4 khung nhãn quay thẳng về camera nhất (đủ để biết chữ có đọc được không).
const ocrFrames = new Set(
  Array.from({ length: total }, (_, k) => k + 1)
    .map((i) => ({ i, tilt: centerTiltDeg(loadGrid(i)), vis: visibleFraction(loadGrid(i)) }))
    .filter((x) => x.tilt <= QC_DEFAULTS.readableTiltMaxDeg && x.vis >= QC_DEFAULTS.visibleMin)
    .sort((a, b) => a.tilt - b.tilt)
    .slice(0, 4)
    .map((x) => x.i),
);
for (let i = 1; i <= total; i++) {
  const name = `frame_${String(i).padStart(6, '0')}.png`;
  const frame = decodePng(new Uint8Array(readFileSync(join(framesDir, name))));
  const grid = JSON.parse(readFileSync(join(framesDir, `${name}.grid.json`), 'utf8')) as ProjectionGrid;
  const first = assessLabelFrame({ frame, label, grid });
  let recognized: string | undefined;
  let verdict = first;
  if (ocrAvail && ocrFrames.has(i)) {
    const oc = await ocrCompareForFrame({ frame, label, grid }, values.lang as string);
    recognized = oc.recognized;
    // Nhãn không có chữ OCR được (logo thuần) thì không áp điều kiện OCR.
    if (oc.available && hasReadableText(oc.expected)) {
      verdict = assessLabelFrame({ frame, label, grid, ocrText: { expected: oc.expected, recognized: oc.recognized } });
    }
  }
  results.push({ ...verdict, frame: i, angleDeg: (360 * (i - 1)) / total, recognized });
  const { ref, got, w, h } = rectifiedFor({ frame, label, grid }, 240);
  const refR = grayToRaster({ ...ref, mask: ref.mask.map(() => 1) });
  const gotR = grayToRaster(got, 160);
  const tile: Raster = { width: w, height: h * 2 + 2, data: new Uint8Array(w * (h * 2 + 2) * 4).fill(60) };
  tile.data.set(refR.data, 0);
  tile.data.set(gotR.data, w * (h + 2) * 4);
  tiles.push(tile);
  writeFileSync(join(out, `pair_${String(i).padStart(2, '0')}_${verdict.verdict}.png`), encodePng(tile));
}
const cols = 6;
const tw = tiles[0]!.width, th = tiles[0]!.height;
const rows = Math.ceil(tiles.length / cols);
const sheet: Raster = { width: cols * (tw + 4), height: rows * (th + 4), data: new Uint8Array(cols * (tw + 4) * rows * (th + 4) * 4).fill(30) };
tiles.forEach((t, k) => {
  const ox = (k % cols) * (tw + 4), oy = Math.floor(k / cols) * (th + 4);
  for (let y = 0; y < th; y++) sheet.data.set(t.data.subarray(y * tw * 4, (y + 1) * tw * 4), ((oy + y) * sheet.width + ox) * 4);
});
writeFileSync(join(out, 'contact-sheet.png'), encodePng(sheet));
const sweep = summarizeSweep(results);
const report = { glb: values.glb, label: values.label, ocr: ocrAvail ? 'tesseract' : 'unavailable', sweep, frames: results };
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ out, ocr: report.ocr, ...sweep }, null, 1));
if (!existsSync(join(out, 'contact-sheet.png'))) process.exit(2);
process.exit(sweep.productPass ? 0 : 1);
