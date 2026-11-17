import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProviderFromEnv, direct, GatewayProvider, MockProvider, ProviderError, readAiConfig, writeCaption } from '../src/index.js';

let server: http.Server;
let baseUrl: string;
const seen: { auth?: string; body?: Record<string, unknown>; url?: string }[] = [];
let mode: 'ok' | 'http500' | 'slow' | 'garbage' = 'ok';

const timeline = {
  version: 1,
  aspect: '16:9',
  duration_s: 8,
  fps: 30,
  tracks: { product: [{ t: 0, t_end: 8, motion: 'spin360' }], camera: [], logo: [] },
};

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      seen.push({ auth: req.headers.authorization, body: JSON.parse(raw || '{}'), url: req.url });
      if (mode === 'http500') {
        res.writeHead(500).end('lỗi nội bộ chứa khoá sk-secret');
      } else if (mode === 'slow') {
        setTimeout(() => res.writeHead(200).end('{}'), 500);
      } else if (mode === 'garbage') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ choices: [] }));
      } else {
        res.writeHead(200, { 'content-type': 'application/json' }).end(
          JSON.stringify({ model: 'fake-1', choices: [{ message: { content: JSON.stringify(timeline) } }], usage: { prompt_tokens: 5, completion_tokens: 7 } }),
        );
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('GatewayProvider (HTTP thật tới server giả cục bộ)', () => {
  const make = (o: Partial<ConstructorParameters<typeof GatewayProvider>[0]> = {}) => new GatewayProvider({ baseUrl, apiKey: 'test-key', model: 'm1', ...o });

  it('gọi chat/completions đúng định dạng, kèm Bearer', async () => {
    mode = 'ok';
    const res = await make().generate({ task: 'director', system: 's', user: 'u', json: true });
    expect(res.model).toBe('fake-1');
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 7 });
    const s = seen.at(-1)!;
    expect(s.url).toBe('/v1/chat/completions');
    expect(s.auth).toBe('Bearer test-key');
    expect(s.body).toMatchObject({ model: 'm1', response_format: { type: 'json_object' } });
  });

  it('HTTP lỗi không làm lộ nội dung phản hồi/khoá', async () => {
    mode = 'http500';
    const err = await make().generate({ task: 'caption', system: 's', user: 'u', json: true }).catch((e: ProviderError) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect((err as ProviderError).code).toBe('http');
    expect((err as ProviderError).message).not.toContain('sk-secret');
  });

  it('timeout', async () => {
    mode = 'slow';
    const err = await make({ timeoutMs: 50 }).generate({ task: 'caption', system: 's', user: 'u', json: true }).catch((e: ProviderError) => e);
    expect((err as ProviderError).code).toBe('timeout');
  });

  it('phản hồi thiếu nội dung → bad_response', async () => {
    mode = 'garbage';
    const err = await make().generate({ task: 'caption', system: 's', user: 'u', json: true }).catch((e: ProviderError) => e);
    expect((err as ProviderError).code).toBe('bad_response');
  });

  it('thiếu cấu hình → ProviderError config', () => {
    expect(() => new GatewayProvider({ baseUrl: '', apiKey: 'k', model: 'm' })).toThrow(ProviderError);
  });

  it('end-to-end: direct() qua HTTP; gateway chết thì về rule-based', async () => {
    mode = 'ok';
    const ok = await direct('xoay chai 8 giây', { provider: make() });
    expect(ok.source).toBe('llm');
    mode = 'http500';
    const bad = await direct('xoay chai 8 giây', { provider: make() });
    expect(bad.source).toBe('rules');
    expect(bad.fallbackReason).toContain('HTTP 500');
  });
});

describe('cấu hình qua biến môi trường', () => {
  it('không có khoá → null (offline)', () => {
    expect(createProviderFromEnv('director', {})).toBeNull();
    expect(createProviderFromEnv('director', { APS_AI_BASE_URL: 'http://x', APS_AI_MODEL: 'm' })).toBeNull();
  });

  it('có đủ → GatewayProvider, model theo tác vụ ưu tiên hơn model chung', () => {
    const env = { APS_AI_BASE_URL: 'http://x/v1', APS_AI_API_KEY: 'k', APS_AI_MODEL: 'general', APS_AI_MODEL_CAPTION: 'cap' };
    expect(createProviderFromEnv('director', env)?.id).toBe('gateway:general');
    expect(createProviderFromEnv('caption', env)?.id).toBe('gateway:cap');
  });

  it('APS_AI_MODE=rules ép offline dù có khoá', () => {
    const env = { APS_AI_BASE_URL: 'http://x/v1', APS_AI_API_KEY: 'k', APS_AI_MODEL: 'm', APS_AI_MODE: 'rules' };
    expect(createProviderFromEnv('director', env)).toBeNull();
    expect(readAiConfig(env).mode).toBe('rules');
  });

  it('timeout không hợp lệ dùng mặc định 20 000 ms', () => {
    expect(readAiConfig({ APS_AI_TIMEOUT_MS: 'abc' }).timeoutMs).toBe(20000);
    expect(readAiConfig({ APS_AI_TIMEOUT_MS: '5000' }).timeoutMs).toBe(5000);
  });
});

describe('mock provider', () => {
  it('hết câu trả lời thì báo lỗi, writeCaption vẫn fallback', async () => {
    const r = await writeCaption({ channel: 'facebook', brand: { name: 'Lumi' }, product: { name: 'Serum' } }, { provider: new MockProvider([]) });
    expect(r.source).toBe('template');
    expect(r.fallbackReason).toContain('provider_error');
  });
});
