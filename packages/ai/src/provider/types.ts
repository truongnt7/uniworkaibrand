/**
 * Giao diện Provider chung cho tác vụ LLM (Đạo diễn AI, caption).
 * App không giữ khoá nhà cung cấp: adapter HTTP trỏ vào AI Gateway của ta (xem docs/ai-layer.md).
 */
export type AiTask = 'director' | 'caption';

export interface LlmRequest {
  task: AiTask;
  system: string;
  user: string;
  /** Provider nên ép đầu ra là một đối tượng JSON. */
  json: boolean;
  /** JSON Schema mô tả đầu ra mong muốn (gợi ý cho provider/gateway; phía ta vẫn tự kiểm tra bằng zod). */
  jsonSchema?: Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface LlmResponse {
  text: string;
  model?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}

export interface LlmProvider {
  readonly id: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly code: 'config' | 'network' | 'timeout' | 'http' | 'bad_response',
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
