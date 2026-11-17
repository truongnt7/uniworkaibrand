#!/usr/bin/env node
/**
 * Chạy QC nhãn cho cả bộ sản phẩm (suite.json do tools/fixtures/make_qc_suite.py tạo) và tổng hợp báo cáo.
 *
 *   node tools/qc/run-suite.mjs --suite /tmp/qc-suite --blender <blender> --out /tmp/qc-out [--angles 18] [--lang eng] [--reuse: chấm lại từ khung đã render]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const { values } = parseArgs({ options: { suite: { type: 'string' }, blender: { type: 'string' }, out: { type: 'string' }, angles: { type: 'string', default: '24' }, lang: { type: 'string', default: 'eng' }, width: { type: 'string', default: '1280' }, height: { type: 'string', default: '720' }, only: { type: 'string' }, reuse: { type: 'boolean', default: false } } });
for (const k of ['suite', 'blender', 'out']) if (!values[k]) throw new Error(`thiếu --${k}`);
const suiteDir = resolve(values.suite);
const outDir = resolve(values.out);
mkdirSync(outDir, { recursive: true });
const suite = JSON.parse(readFileSync(join(suiteDir, 'suite.json'), 'utf8')).filter((p) => !values.only || values.only.split(',').includes(p.name));

const rows = [];
for (const p of suite) {
  const dir = join(outDir, p.name);
  const args = [
    'exec', 'tsx', 'scripts/label-qc.mts', ...(values.reuse ? ['--reuse'] : []),
    '--blender', resolve(values.blender), '--glb', join(suiteDir, p.glb), '--label', join(suiteDir, p.label),
    '--lang', values.lang, '--angles', values.angles, '--width', values.width, '--height', values.height,
    '--label-mode', p.mode, '--label-width', String(p.widthMm), '--label-height', String(p.heightMm), '--label-bottom', String(p.bottomMm),
    '--label-center=' + String(p.centerDeg), '--out', dir,
  ];
  const t0 = Date.now();
  const r = spawnSync('pnpm', args, { cwd: join(root, 'apps', 'desktop'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  let report = null;
  try { report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')); } catch { /* lỗi dựng */ }
  const s = report?.sweep;
  rows.push({ name: p.name, mode: p.mode, pass: !!s?.productPass, considered: s?.considered ?? 0, passed: s?.passed ?? 0, tilted: s?.tilted ?? 0, hidden: s?.hidden ?? 0, exit: r.status, seconds: Math.round((Date.now() - t0) / 1000) });
  console.log(JSON.stringify(rows.at(-1)));
}
// Đối chứng âm: dùng khung của sản phẩm i nhưng so với nhãn của sản phẩm khác (nhãn sai) -> PHẢI không đạt, để chắc QC không "đạt mọi thứ".
const negatives = [];
for (let i = 0; i < suite.length; i++) {
  const p = suite[i];
  const other = suite[(i + 1) % suite.length];
  const dir = join(outDir, p.name);
  const args = [
    'exec', 'tsx', 'scripts/label-qc.mts', '--reuse', '--blender', resolve(values.blender), '--glb', join(suiteDir, p.glb), '--label', join(suiteDir, other.label),
    '--lang', values.lang, '--angles', values.angles, '--width', values.width, '--height', values.height,
    '--label-mode', p.mode, '--label-width', String(p.widthMm), '--label-height', String(p.heightMm), '--label-bottom', String(p.bottomMm),
    '--label-center=' + String(p.centerDeg), '--out', join(outDir, `neg_${p.name}_vs_${other.name}`),
  ];
  // --reuse chỉ dùng khung nếu thư mục đích có sẵn: sao chép khung + lưới của sản phẩm i.
  const dst = join(outDir, `neg_${p.name}_vs_${other.name}`, 'frames');
  mkdirSync(dst, { recursive: true });
  for (const f of readdirSync(join(dir, 'frames'))) copyFileSync(join(dir, 'frames', f), join(dst, f));
  const r = spawnSync('pnpm', args, { cwd: join(root, 'apps', 'desktop'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const rep = JSON.parse(readFileSync(join(outDir, `neg_${p.name}_vs_${other.name}`, 'report.json'), 'utf8'));
  negatives.push({ frames: p.name, labelOf: other.name, rejected: !rep.sweep.productPass, passRatio: rep.sweep.passRatio, exit: r.status });
  console.log(JSON.stringify(negatives.at(-1)));
}
const ok = rows.filter((r) => r.pass).length;
const negOk = negatives.every((n) => n.rejected);
const summary = { total: rows.length, passed: ok, target: '>= 8/10', meetsTarget: rows.length >= 10 && ok >= 8 && negOk, negativeControls: negatives, rows };
writeFileSync(join(outDir, 'suite-report.json'), JSON.stringify(summary, null, 1));
const md = ['| Sản phẩm | Kiểu | Khung xét được | Đạt | Nghiêng (cảnh báo) | Khuất | Kết quả |', '|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.name} | ${r.mode} | ${r.considered} | ${r.passed} | ${r.tilted} | ${r.hidden} | ${r.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'} |`), '', `Tổng: ${ok}/${rows.length}`, '', '| Đối chứng âm (khung sản phẩm A, nhãn của B) | Bị từ chối đúng |', '|---|---|', ...negatives.map((n) => `| ${n.frames} vs nhãn ${n.labelOf} | ${n.rejected ? 'có' : 'KHÔNG (lỗi QC)'} |`)];
writeFileSync(join(outDir, 'suite-report.md'), md.join('\n'));
console.log(md.join('\n'));
process.exit(summary.meetsTarget ? 0 : 1);
