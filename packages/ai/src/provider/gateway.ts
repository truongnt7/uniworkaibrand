import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { ProviderError } from './types.js';

export interface GatewayProviderOptions {
  /** Ví dụ https://gateway.example.com/v1 (giao thức OpenAI-compatible: POST {baseUrl}/chat/completions). */
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Mặc định 20 000 ms. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Header bổ sung (ví dụ định danh workspace). */
  headers?: Record<string, string>;
}

interface ChatCompletion {
  model?: string;
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Adapter LLM qua AI Gateway (OpenAI-compatible chat completions).
 * Cùng adapter dùng được cho gateway nội bộ và trực tiếp nhà cung cấp có endpoint tương thích (chỉ khi dev).
 */
export class GatewayProvider implements LlmProvider {
  readonly id: string;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GatewayProviderOptions) {
    if (!opts.baseUrl || !opts.apiKey || !opts.model) {
      throw new ProviderError('Thiếu baseUrl/apiKey/model cho GatewayProvider', 'config');
    }
    this.id = `gateway:${opts.model}`;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    const timeoutMs = request.timeoutMs ?? this.opts.timeoutMs ?? 20_000;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    const body: Record<string, unknown> = {
      model: this.opts.model,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      temperature: request.temperature ?? 0.2,
    };
    if (request.maxTokens) body.max_tokens = request.maxTokens;
    if (request.json) body.response_format = { type: 'json_object' };

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.opts.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.opts.apiKey}`,
          ...this.opts.headers,
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (timeout.aborted) throw new ProviderError(`Hết thời gian chờ ${timeoutMs} ms`, 'timeout');
      throw new ProviderError(`Lỗi mạng: ${(err as Error).message}`, 'network');
    }
    if (!res.ok) {
      // Không đưa nội dung phản hồi/khoá vào thông điệp lỗi.
      throw new ProviderError(`Gateway trả HTTP ${res.status}`, 'http', res.status);
    }
    let data: ChatCompletion;
    try {
      data = (await res.json()) as ChatCompletion;
    } catch {
      throw new ProviderError('Phản hồi gateway không phải JSON', 'bad_response');
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.length === 0) {
      throw new ProviderError('Phản hồi gateway thiếu nội dung', 'bad_response');
    }
    return {
      text: content,
      model: data.model,
      usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens },
    };
  }
}
