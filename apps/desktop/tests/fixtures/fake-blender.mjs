// Blender giả cho test tích hợp: nói đúng giao thức job.json -> JSON-lines, ghi PNG hợp lệ nhỏ.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

const argv = process.argv.slice(2);
if (argv.includes('--version')) {
  console.log('Blender 4.5.16 LTS');
  process.exit(0);
}
const jobPath = argv[argv.indexOf('--') + 1];
const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const emit = (o) => process.stdout.write(`\n${JSON.stringify(o)}\n`);

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, shade) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const row = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = shade;
    row[2 + x * 3] = (x * 4) & 255;
    row[3 + x * 3] = 128;
  }
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const delay = Number(process.env.FAKE_DELAY_MS ?? 0);
const total = job.frames.total;
mkdirSync(job.paths.framesDir, { recursive: true });

if (process.env.FAKE_ERROR) {
  emit({ type: 'error', code: process.env.FAKE_ERROR, message: 'lỗi giả lập' });
  process.exit(1);
}
const name = (i) => `${job.paths.framesDir}/frame_${String(i).padStart(6, '0')}.png`;
emit({ type: 'device', engine: job.render.engine, device: 'FAKE', fallbackToCpu: false });
const w = Math.max(16, Math.min(job.render.width, 160));
const h = Math.max(16, Math.min(job.render.height, 90));
for (let i = 1; i <= total; i++) {
  emit({ type: 'progress', phase: 'render', frame: i - 1, total });
  if (existsSync(name(i))) {
    emit({ type: 'frame_done', frame: i, path: name(i), ms: 0, skipped: true });
    continue;
  }
  if (process.env.FAKE_CRASH_AT && Number(process.env.FAKE_CRASH_AT) === i) process.exit(137);
  if (delay) await sleep(delay);
  const part = `${name(i)}.part`;
  writeFileSync(part, png(w, h, Math.round((i / total) * 255)));
  renameSync(part, name(i));
  emit({ type: 'frame_done', frame: i, path: name(i), ms: delay });
}
emit({ type: 'done', frames: total, ms: 1 });
