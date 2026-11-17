import { GatewayProvider } from './gateway.js';
import type { AiTask, LlmProvider } from './types.js';

export type AiEnv = Record<string, string | undefined>;

/**
 * Biến môi trường (không commit giá trị; xem packages/ai/.env.example):
 *  APS_AI_BASE_URL, APS_AI_API_KEY, APS_AI_MODEL           cấu hình chung
 *  APS_AI_MODEL_DIRECTOR, APS_AI_MODEL_CAPTION             model riêng theo tác vụ (tuỳ chọn)
 *  APS_AI_TIMEOUT_MS                                       mặc định 20000
 *  APS_AI_MODE = auto | rules                              'rules' ép chạy offline kể cả khi có khoá
 */
export interface AiConfig {
  mode: 'auto' | 'rules';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  models: Partial<Record<AiTask, string>>;
  timeoutMs: number;
}

export function readAiConfig(env: AiEnv = process.env): AiConfig {
  const mode = env.APS_AI_MODE === 'rules' ? 'rules' : 'auto';
  const timeout = Number(env.APS_AI_TIMEOUT_MS);
  return {
    mode,
    baseUrl: env.APS_AI_BASE_URL || undefined,
    apiKey: env.APS_AI_API_KEY || undefined,
    model: env.APS_AI_MODEL || undefined,
    models: {
      director: env.APS_AI_MODEL_DIRECTOR || undefined,
      caption: env.APS_AI_MODEL_CAPTION || undefined,
    },
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 20_000,
  };
}

/** Trả provider cho tác vụ, hoặc null nếu chưa cấu hình/đang ép offline → caller dùng rule-based. */
export function createProviderFromEnv(
  task: AiTask,
  env: AiEnv = process.env,
  fetchImpl?: typeof fetch,
): LlmProvider | null {
  const cfg = readAiConfig(env);
  if (cfg.mode === 'rules') return null;
  const model = cfg.models[task] ?? cfg.model;
  if (!cfg.baseUrl || !cfg.apiKey || !model) return null;
  return new GatewayProvider({ baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, model, timeoutMs: cfg.timeoutMs, fetch: fetchImpl });
}
