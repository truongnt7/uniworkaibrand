// Đo thời gian tách nền local trên CPU. Dùng: pnpm --filter @aps/ai bg:bench [u2netp] [birefnet-lite]
import { mkdirSync, writeFileSync } from 'node:fs';
import { availableParallelism, cpus, totalmem } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BACKGROUND_MODELS, OnnxBackgroundRemover, type BackgroundModelId } from '../src/background/index.js';
import { iou, syntheticBottle } from '../tests/helpers/synthetic-bottle.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '../.bench-out');
mkdirSync(outDir, { recursive: true });
const models = (process.argv.slice(2).length ? process.argv.slice(2) : ['u2netp']) as BackgroundModelId[];
const sizes: [number, number][] = [[1024, 1024], [2048, 2048]];
const RUNS = 5;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]!;

const report: Record<string, unknown>[] = [];
console.log(`CPU: ${cpus()[0]?.model} x${availableParallelism()}, RAM ${(totalmem() / 2 ** 30).toFixed(1)} GiB, node ${process.version}`);
for (const id of models) {
  const spec = BACKGROUND_MODELS[id];
  const remover = new OnnxBackgroundRemover({ model: id });
  const t0 = performance.now();
  await remover.warmup();
  const loadMs = performance.now() - t0;
  for (const [w, h] of sizes) {
    const { image, truth } = await syntheticBottle(w, h);
    await remover.removeBackground(image); // làm nóng
    const runs = [];
    let last;
    for (let i = 0; i < RUNS; i++) {
      last = await remover.removeBackground(image);
      runs.push(last.timings);
    }
    const row = {
      model: id,
      license: spec.modelLicense,
      modelMB: +(spec.sizeBytes / 2 ** 20).toFixed(1),
      image: `${w}x${h}`,
      loadMs: Math.round(loadMs),
      medianTotalMs: Math.round(median(runs.map((r) => r.totalMs))),
      medianInferenceMs: Math.round(median(runs.map((r) => r.inferenceMs))),
      medianPrePostMs: Math.round(median(runs.map((r) => r.preprocessMs + r.postprocessMs + r.decodeMs))),
      iouSynthetic: +iou(last!.mask, truth).toFixed(3),
      rssMB: Math.round(process.memoryUsage().rss / 2 ** 20),
    };
    report.push(row);
    console.log(JSON.stringify(row));
    writeFileSync(path.join(outDir, `${id}-${w}x${h}.png`), last!.png);
  }
  await remover.dispose();
}
writeFileSync(path.join(outDir, 'bench.json'), JSON.stringify(report, null, 2));
