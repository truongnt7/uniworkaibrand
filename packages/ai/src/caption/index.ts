import type { LlmProvider } from '../provider/types.js';
import { captionWithLlm } from './llm.js';
import { captionFromTemplate } from './template.js';
import { BrandVoice, CHANNEL_LIMITS, ProductInfo, type CaptionRequestInput, type CaptionResult } from './types.js';

export * from './types.js';
export { toHashtag, uniqueHashtags } from './hashtags.js';
export { captionFromTemplate } from './template.js';
export { captionWithLlm, validateCaptionOutput, buildCaptionPrompts } from './llm.js';

export interface WriteCaptionOptions {
  /** Không có provider = mẫu offline (xác định). */
  provider?: LlmProvider | null;
  maxRetries?: number;
  signal?: AbortSignal;
}

function compose(caption: string, hashtags: string[]): string {
  return hashtags.length ? `${caption}\n\n${hashtags.join(' ')}` : caption;
}

/** Điểm vào viết caption/hashtag theo kênh. LLM lỗi/vi phạm quy tắc thì về mẫu offline. */
export async function writeCaption(input: CaptionRequestInput, opts: WriteCaptionOptions = {}): Promise<CaptionResult> {
  const brand = BrandVoice.parse(input.brand);
  const product = ProductInfo.parse(input.product);
  const note = input.contentNote?.trim() || undefined;
  let fallbackReason: string | undefined;

  if (opts.provider) {
    const out = await captionWithLlm(opts.provider, input.channel, brand, product, note, opts);
    if (out.ok && out.caption && out.hashtags) {
      return {
        channel: input.channel,
        caption: out.caption,
        hashtags: out.hashtags,
        text: compose(out.caption, out.hashtags),
        source: 'llm',
        warnings: out.warnings,
      };
    }
    fallbackReason = out.reason;
  }

  const t = captionFromTemplate(input.channel, brand, product, note);
  const warnings: string[] = [];
  if (t.hashtags.length < CHANNEL_LIMITS[input.channel].hashtags.min) warnings.push('hashtag_few');
  return {
    channel: input.channel,
    caption: t.caption,
    hashtags: t.hashtags,
    text: compose(t.caption, t.hashtags),
    source: 'template',
    warnings,
    ...(fallbackReason ? { fallbackReason } : {}),
  };
}
