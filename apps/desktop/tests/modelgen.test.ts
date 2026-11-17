import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const BLENDER = process.env.APS_BLENDER_BIN ?? '';
const repo = resolve(__dirname, '..', '..', '..');

describe.skipIf(!BLENDER || !existsSync(BLENDER))('P0-10 model tham số (cần Blender thật: APS_BLENDER_BIN)', () => {
  it('5 chai/lọ/lon + 3 hộp: glb đúng kích thước nhập (sai ≤ 3%)', () => {
    const out = mkdtempSync(join(tmpdir(), 'aps-modelgen-'));
    const r = spawnSync(BLENDER, ['-b', '--factory-startup', '--python', join(repo, 'blender-worker/modelgen/parametric.py'), '--', join(repo, 'tools/fixtures/param-models.json'), out], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    const report = JSON.parse(readFileSync(join(out, 'report.json'), 'utf8')) as Array<{ name: string; type: string; maxErrorPct: number }>;
    expect(report.filter((m) => m.type === 'lathe')).toHaveLength(5);
    expect(report.filter((m) => m.type === 'box')).toHaveLength(3);
    for (const m of report) expect(m.maxErrorPct, m.name).toBeLessThanOrEqual(3);
  }, 120_000);
});
