import type { LlmProvider } from '../provider/types.js';
import { directWithLlm } from './llm.js';
import { directFromRules } from './rules.js';
import type { DirectorContext, DirectorResult } from './types.js';

export * from './types.js';
export { directFromRules, fold } from './rules.js';
export { directWithLlm, buildDirectorSystemPrompt } from './llm.js';

const MAX_PROMPT_CHARS = 1500;

export interface DirectOptions {
  context?: DirectorContext;
  /** Có provider thì thử LLM trước, lỗi/sai schema thì về rule-based. Không có = rule-based (mặc định MVP, offline). */
  provider?: LlmProvider | null;
  maxRetries?: number;
  signal?: AbortSignal;
}

/** Điểm vào của Đạo diễn AI: prompt tiếng Việt → timeline đã validate. Không bao giờ ném lỗi vì LLM. */
export async function direct(prompt: string, opts: DirectOptions = {}): Promise<DirectorResult> {
  const context = opts.context ?? {};
  const warnings: string[] = [];
  let text = prompt;
  if (text.length > MAX_PROMPT_CHARS) {
    text = text.slice(0, MAX_PROMPT_CHARS);
    warnings.push(`prompt_truncated: prompt dài hơn ${MAX_PROMPT_CHARS} ký tự, đã cắt bớt`);
  }

  let fallbackReason: string | undefined;
  if (opts.provider) {
    const out = await directWithLlm(text, {
      provider: opts.provider,
      context,
      maxRetries: opts.maxRetries,
      signal: opts.signal,
    });
    if (out.ok) {
      return { timeline: out.timeline, source: 'llm', warnings, fixes: out.fixes };
    }
    fallbackReason = out.reason;
  }

  const rules = directFromRules(text, context);
  return {
    timeline: rules.timeline,
    source: 'rules',
    warnings: [...warnings, ...rules.warnings],
    fixes: [],
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
