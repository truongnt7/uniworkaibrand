import type { LlmProvider, LlmRequest, LlmResponse } from './types.js';
import { ProviderError } from './types.js';

export type MockReply = string | Error | ((request: LlmRequest) => string | Promise<string>);

/** Provider giả cho test/chạy offline: trả lần lượt các câu trả lời đã định sẵn. */
export class MockProvider implements LlmProvider {
  readonly id = 'mock';
  readonly calls: LlmRequest[] = [];
  private readonly replies: MockReply[];

  constructor(replies: MockReply[] = []) {
    this.replies = [...replies];
  }

  async generate(request: LlmRequest): Promise<LlmResponse> {
    this.calls.push(request);
    const next = this.replies.shift();
    if (next === undefined) throw new ProviderError('MockProvider hết câu trả lời', 'bad_response');
    if (next instanceof Error) throw next;
    const text = typeof next === 'function' ? await next(request) : next;
    return { text, model: 'mock' };
  }
}
