import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { templateLibraryJsonSchema } from '../src/schema.js';

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../schema/template-library.schema.json');
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(templateLibraryJsonSchema(), null, 2)}\n`);
console.log(`Đã ghi ${out}`);
