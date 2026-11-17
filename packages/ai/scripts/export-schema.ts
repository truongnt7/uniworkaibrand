import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timelineJsonSchema } from '../src/timeline/schema.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../schema/timeline.schema.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(timelineJsonSchema(), null, 2)}\n`);
console.log(`Đã ghi ${out}`);
