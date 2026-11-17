#!/usr/bin/env node
/**
 * Chạy QC nhãn cho cả bộ sản phẩm (suite.json do tools/fixtures/make_qc_suite.py tạo) và tổng hợp báo cáo.
 *
 *   node tools/qc/run-suite.mjs --suite /tmp/qc-suite --blender <blender> --out /tmp/qc-out [--angles 24] [--lang eng]
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..', '..');
const { values } = parseArgs({ options: { suite: { type: 'string' }, blender: { type: 'string' }, out: { type: 'string' }, angles: { type: 'string', default: '24' }, lang: { type: 'string', default: 'eng' }, width: { type: 'string', default: '1280' }, height: { type: 'string', default: '720' }, only: { type: 'string' } } });
for (const k of ['suite', 'blender', 'out']) if (!values[k]) throw new Error(`thiếu --${k}`);
const suiteDir = resolve(values.suite);
const outDir = resolve(values.out);
mkdirSync(outDir, { recursive: true });
const suite = JSON.parse(readFileSync(join(suiteDir, 'suite.json'), 'utf8')).filter((p) => !values.only || values.only.split(',').includes(p.name));

const rows = [];
for (const p of suite) {
  const dir = join(outDir, p.name);
  const args = [
    'exec', 'tsx', 'scripts/label-qc.mts',
    '--blender', resolve(values.blender), '--glb', join(suiteDir, p.glb), '--label', join(suiteDir, p.label),
    '--expect-text', p.expected, '--lang', values.lang, '--angles', values.angles, '--width', values.width, '--height', values.height,
    '--label-mode', p.mode, '--label-width', String(p.widthMm), '--label-height', String(p.heightMm), '--label-bottom', String(p.bottomMm),
    '--label-center', String(p.centerDeg), '--out', dir,
  ];
  const t0 = Date.now();
  const r = spawnSync('pnpm', args, { cwd: join(root, 'apps', 'desktop'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  let report = null;
  try { report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')); } catch { /* lỗi dựng */ }
  const s = report?.sweep;
  rows.push({ name: p.name, mode: p.mode, pass: !!s?.productPass, considered: s?.considered ?? 0, passed: s?.passed ?? 0, tilted: s?.tilted ?? 0, hidden: s?.hidden ?? 0, exit: r.status, seconds: Math.round((Date.now() - t0) / 1000) });
  console.log(JSON.stringify(rows.at(-1)));
}
const ok = rows.filter((r) => r.pass).length;
const summary = { total: rows.length, passed: ok, target: '>= 8/10', meetsTarget: rows.length >= 10 && ok >= 8, rows };
writeFileSync(join(outDir, 'suite-report.json'), JSON.stringify(summary, null, 1));
const md = ['| Sản phẩm | Kiểu | Khung xét được | Đạt | Nghiêng (cảnh báo) | Khuất | Kết quả |', '|---|---|---|---|---|---|---|', ...rows.map((r) => `| ${r.name} | ${r.mode} | ${r.considered} | ${r.passed} | ${r.tilted} | ${r.hidden} | ${r.pass ? 'ĐẠT' : 'KHÔNG ĐẠT'} |`), '', `Tổng: ${ok}/${rows.length}`];
writeFileSync(join(outDir, 'suite-report.md'), md.join('\n'));
console.log(md.join('\n'));
process.exit(summary.meetsTarget ? 0 : 1);
