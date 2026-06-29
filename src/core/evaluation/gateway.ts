// ─────────────────────────────────────────────────────────────
// Quartermaster — Model Gateway Client
// Provider-agnostic LLM gateway for agentic evaluation.
// FR-103: Route through developer-configured endpoint.
// NFR-061: Provider-agnostic, not bound to one vendor.
// ─────────────────────────────────────────────────────────────

import type { GatewayConfig, GatewayResponse } from '@core/types';

// ─── Errors ─────────────────────────────────────────────────

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}

export class GatewayTimeoutError extends GatewayError {
  constructor(public readonly operation: string) {
    super(`Gateway timeout during ${operation}`);
    this.name = 'GatewayTimeoutError';
  }
}

// ─── Severity helpers ────────────────────────────────────────

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const BACKOFF_MS = [100, 200, 400];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Core HTTP call ──────────────────────────────────────────

async function chatComplete(
  messages: Array<{ role: string; content: string }>,
  config: GatewayConfig,
): Promise<GatewayResponse> {
  if (messages.length === 0 || !messages[0]?.content?.trim()) {
    throw new GatewayError('Empty prompt');
  }

  // Resolve API key from env if not in config
  const apiKey =
    config.apiKey ?? process.env['OPENAI_API_KEY'] ?? process.env['ANTHROPIC_API_KEY'] ?? undefined;

  if (!config.baseUrl) {
    throw new GatewayError(
      'No model endpoint configured. Set baseUrl in gateway config or run: qm config set eval.baseUrl <url>',
    );
  }

  const url = `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const body = JSON.stringify({
    model: config.model,
    messages,
    max_tokens: 4096,
  });

  let lastError: unknown;
  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = BACKOFF_MS[attempt - 1] ?? 400;
      await sleep(delay);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeout);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (resp.status === 401) {
        throw new GatewayError(
          `Authentication failed (401). Set OPENAI_API_KEY or ANTHROPIC_API_KEY env var.`,
        );
      }

      if (!resp.ok && !RETRYABLE_STATUS.has(resp.status)) {
        const raw = await resp.text().catch(() => '');
        throw new GatewayError(`Gateway returned ${resp.status}: ${raw.slice(0, 200)}`);
      }

      if (!resp.ok) {
        // Retryable
        lastError = new GatewayError(`Gateway returned ${resp.status}`);
        continue;
      }

      const json: unknown = await resp.json();
      return parseResponse(json, config.model);
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error)?.name === 'AbortError') {
        throw new GatewayTimeoutError('chat completion');
      }
      if (err instanceof GatewayError) throw err;
      lastError = err;
    }
  }

  throw new GatewayError(`All ${config.maxRetries + 1} attempts failed`, lastError);
}

function parseResponse(json: unknown, fallbackModel: string): GatewayResponse {
  if (
    typeof json !== 'object' ||
    json === null ||
    !('choices' in json) ||
    !Array.isArray((json as Record<string, unknown>)['choices'])
  ) {
    throw new GatewayError(`Unexpected response shape: ${JSON.stringify(json).slice(0, 200)}`);
  }

  const choices = (json as { choices: unknown[] }).choices;
  const first = choices[0];
  if (typeof first !== 'object' || first === null || !('message' in first)) {
    throw new GatewayError('No choices in response');
  }

  const msg = (first as { message: { content?: string } }).message;
  const content = msg?.content ?? '';

  const usage = (json as { usage?: { prompt_tokens?: number; completion_tokens?: number } }).usage;
  const model = (json as { model?: string }).model ?? fallbackModel;

  const result: GatewayResponse = { content, model };
  if (usage) {
    result.usage = {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
    };
  }
  return result;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * FR-103: Single-turn model call.
 */
export async function singleTurn(prompt: string, config: GatewayConfig): Promise<GatewayResponse> {
  return chatComplete([{ role: 'user', content: prompt }], config);
}

/**
 * FR-103: Multi-turn model call with full message history.
 */
export async function multiTurn(
  messages: Array<{ role: string; content: string }>,
  config: GatewayConfig,
): Promise<GatewayResponse> {
  return chatComplete(messages, config);
}
