/**
 * So ảnh render của Blender đầy đủ và bản rút gọn trên cảnh chuẩn (EEVEE + Cycles, 3 góc) — P0-08.
 *
 *   pnpm --filter @aps/desktop exec tsx scripts/compare-slim.mts --full <blender> --slim <blender> [--out dir] [--max-mean 0.5]
 * Thoát mã 1 nếu sai khác trung bình (thang 0-255) vượt --max-mean, hoặc bản rút gọn lỗi.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { blenderArgs, decodePng, ssim, toGray } from '@aps/render-core';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const { values } = parseArgs({ options: { full: { type: 'string' }, slim: { type: 'string' }, out: { type: 'string', default: '/tmp/slim-compare' }, 'max-mean': { type: 'string', default: '0.5' } } });
if (!values.full || !values.slim) throw new Error('thiếu --full/--slim');
const out = resolve(values.out as string);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

function render(bin: string, tag: string, engine: string, angle: number): string {
  const dir = join(out, `${tag}-${engine}-${angle}`);
  mkdirSync(dir, { recursive: true });
  const job = {
    version: 1, mode: 'render', jobId: 'slim',
    product: { glbPath: join(repo, 'assets/samples/serum-bottle.glb'), label: { imagePath: join(repo, 'assets/samples/label.png'), mode: 'cylinder', widthMm: 94, heightMm: 60, bottomMm: 20, centerDeg: 0 } },
    scene: { template: 'studio-soft', backgroundColor: '#e9e4dc', shadow: 0.6 },
    motion: 'spin360',
    render: { engine, samples: engine === 'cycles' ? 24 : 16, width: 640, height: 360, device: 'cpu' },
    frames: { total: 1, angleStartDeg: angle, angleSpanDeg: 0 },
    paths: { framesDir: dir, pattern: 'frame_%06d.png' },
  };
  writeFileSync(join(dir, 'job.json'), JSON.stringify(job));
  const r = spawnSync(resolve(bin), blenderArgs(join(repo, 'blender-worker/worker.py'), join(dir, 'job.json')), { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`${tag}/${engine}/${angle} lỗi (mã ${r.status}): ${r.stdout.slice(-400)}`);
  return join(dir, 'frame_000001.png');
}

const rows: Array<Record<string, unknown>> = [];
let worst = 0;
for (const engine of ['eevee', 'cycles']) {
  for (const angle of [0, 120, 240]) {
    const a = decodePng(new Uint8Array(readFileSync(render(values.full as string, 'full', engine, angle))));
    const b = decodePng(new Uint8Array(readFileSync(render(values.slim as string, 'slim', engine, angle))));
    let sum = 0, max = 0, sq = 0;
    const n = a.width * a.height * 3;
    for (let i = 0; i < a.data.length; i += 4) for (let c = 0; c < 3; c++) {
      const d = Math.abs(a.data[i + c]! - b.data[i + c]!);
      sum += d; sq += d * d; max = Math.max(max, d);
    }
    const mean = sum / n;
    const psnr = sq === 0 ? Infinity : 10 * Math.log10((255 * 255) / (sq / n));
    const s = ssim(toGray(a), toGray(b)).score;
    worst = Math.max(worst, mean);
    rows.push({ engine, angle, meanAbsDiff: +mean.toFixed(4), maxDiff: max, psnrDb: Number.isFinite(psnr) ? +psnr.toFixed(1) : 'identical', ssim: +s.toFixed(5) });
    console.log(JSON.stringify(rows.at(-1)));
  }
}
const limit = Number(values['max-mean']);
const result = { limitMeanAbsDiff: limit, worstMeanAbsDiff: worst, pass: worst <= limit, rows };
writeFileSync(join(out, 'compare.json'), JSON.stringify(result, null, 1));
console.log(result.pass ? `ĐẠT (sai khác trung bình lớn nhất ${worst.toFixed(4)} ≤ ${limit})` : `KHÔNG ĐẠT (${worst.toFixed(4)} > ${limit})`);
process.exit(result.pass ? 0 : 1);
