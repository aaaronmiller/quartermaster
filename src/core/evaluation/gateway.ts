// ─────────────────────────────────────────────────────────────
// Quartermaster — Model Gateway Client
// Provider-agnostic, config-driven, and mockable for tests.
// ─────────────────────────────────────────────────────────────

import { resolveApiKey } from '@core/config/secrets';
import type { QuartermasterConfig } from '@core/config/schema';
import type { GatewayConfig, GatewayResponse } from '@core/types';

export interface GatewayMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GatewayCallOptions {
  fetchImpl?: typeof fetch;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export function resolveGatewayConfig(
  config: QuartermasterConfig,
  task: string,
  env: Record<string, string | undefined> = process.env,
): GatewayConfig {
  const model = config.eval.models[task] ?? config.eval.defaultModel;
  const apiKey = resolveApiKey(config, env);
  return {
    provider: config.eval.provider,
    baseUrl: config.eval.baseUrl,
    model,
    timeout: 30_000,
    maxRetries: 0,
    ...(apiKey ? { apiKey } : {}),
  };
}

export async function singleTurn(
  prompt: string,
  config: GatewayConfig,
  options: GatewayCallOptions = {},
): Promise<GatewayResponse> {
  return chatComplete([{ role: 'user', content: prompt }], config, options);
}

export async function multiTurn(
  messages: GatewayMessage[],
  config: GatewayConfig,
  options: GatewayCallOptions = {},
): Promise<GatewayResponse> {
  return chatComplete(messages, config, options);
}

async function chatComplete(
  messages: GatewayMessage[],
  config: GatewayConfig,
  options: GatewayCallOptions,
): Promise<GatewayResponse> {
  if (!config.baseUrl) {
    throw new GatewayError('No model endpoint configured. Set eval.baseUrl before running evaluation.');
  }
  if (!config.model) {
    throw new GatewayError('No model configured. Set eval.defaultModel or eval.models.<task>.');
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

  const response = await fetchImpl(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: config.model, messages }),
  });

  if (!response.ok) {
    throw new GatewayError(`Gateway returned ${response.status}`);
  }

  return parseResponse(await response.json(), config.model);
}

export function parseResponse(json: unknown, fallbackModel: string): GatewayResponse {
  if (typeof json !== 'object' || json === null) {
    throw new GatewayError('Unexpected response shape: non-object response');
  }
  const obj = json as Record<string, unknown>;

  const choices = obj.choices;
  if (Array.isArray(choices)) {
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    if (typeof message?.content === 'string') {
      return response(message.content, obj, fallbackModel);
    }
  }

  if (typeof obj.output_text === 'string') return response(obj.output_text, obj, fallbackModel);
  if (typeof obj.content === 'string') return response(obj.content, obj, fallbackModel);

  throw new GatewayError(`Unexpected response shape: ${JSON.stringify(json).slice(0, 200)}`);
}

function response(content: string, obj: Record<string, unknown>, fallbackModel: string): GatewayResponse {
  const usage = obj.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
  return {
    content,
    model: typeof obj.model === 'string' ? obj.model : fallbackModel,
    ...(usage
      ? {
          usage: {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
          },
        }
      : {}),
  };
}
