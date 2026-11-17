import { WorkerEvent } from '@aps/shared';

export type ParsedLine =
  | { kind: 'event'; event: WorkerEvent }
  | { kind: 'raw'; text: string };

/**
 * Tách stdout của worker thành từng dòng JSON. Blender tự in thêm các dòng thường
 * (banner, "Fra:1 Mem:..."): dòng không phải JSON hợp lệ được trả về dạng `raw`.
 */
export class JsonLinesParser {
  private buffer = '';

  push(chunk: string | Buffer): ParsedLine[] {
    this.buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    return lines.map(parseLine).filter((x): x is ParsedLine => x !== null);
  }

  flush(): ParsedLine[] {
    const rest = this.buffer;
    this.buffer = '';
    const out = parseLine(rest);
    return out ? [out] : [];
  }
}

export function parseLine(line: string): ParsedLine | null {
  const text = line.trim();
  if (!text) return null;
  if (text.startsWith('{')) {
    try {
      const parsed = WorkerEvent.safeParse(JSON.parse(text));
      if (parsed.success) return { kind: 'event', event: parsed.data };
    } catch {
      // rơi xuống raw
    }
  }
  return { kind: 'raw', text };
}
