/** Tách một đối tượng JSON khỏi văn bản LLM (bỏ rào ```json, lời dẫn thừa). Trả undefined nếu không parse được. */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const body = fenced?.[1]?.trim() ?? trimmed;
  const candidates = [body];
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start >= 0 && end > start) candidates.push(body.slice(start, end + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* thử ứng viên kế tiếp */
    }
  }
  return undefined;
}

/** Dấu hiệu mã/lệnh trong đầu ra: Đạo diễn AI không bao giờ được trả mã (xem docs/ai-layer.md). */
const CODE_LIKE = /\bbpy\b|\bimport\s+\w+|\bexec\s*\(|\beval\s*\(|__\w+__|\bos\.(system|popen)|\bsubprocess\b|<script/i;

export function looksLikeCode(text: string): boolean {
  return CODE_LIKE.test(text);
}
