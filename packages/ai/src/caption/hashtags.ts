/** Làm sạch thành hashtag: bỏ khoảng trắng/dấu câu, giữ chữ cái tiếng Việt có dấu. Trả undefined nếu rỗng. */
export function toHashtag(raw: string): string | undefined {
  const cleaned = raw
    .normalize('NFC')
    .replace(/^#+/, '')
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
    .replace(/[^\p{L}\p{N}_]/gu, '');
  if (cleaned.length < 2 || cleaned.length > 40 || /^\d+$/.test(cleaned)) return undefined;
  return `#${cleaned}`;
}

export function uniqueHashtags(list: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const tag = toHashtag(raw);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}
