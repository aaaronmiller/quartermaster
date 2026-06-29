// ─────────────────────────────────────────────────────────────
// Quartermaster — Secret handling (NFR-031)
// Credentials are resolved from the local environment at use time
// and NEVER stored in config files, plans, logs, or profiles.
// `redactSecrets` defends serialization paths that might otherwise
// carry a key (e.g. a GatewayConfig passed to a logger).
// ─────────────────────────────────────────────────────────────

import type { QuartermasterConfig } from './schema';

export const REDACTED = '«redacted»';

/** Field names whose values must never be emitted. */
const SECRET_KEYS = /^(apikey|api_key|token|secret|password|authorization|bearer)$/i;

/**
 * Resolve the eval API key from the environment variable named by config.
 * Returns undefined if unset. The key value is returned only to the caller
 * that needs it for a request — it is never persisted.
 */
export function resolveApiKey(
  cfg: QuartermasterConfig,
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return env[cfg.eval.apiKeyEnv] || undefined;
}

/**
 * Deep-copy a value with any secret-named field masked.
 * Use before logging or serializing anything that might hold a credential.
 */
export function redactSecrets<T>(value: T): T {
  return walk(value) as T;
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SECRET_KEYS.test(key) && v ? REDACTED : walk(v);
    }
    return out;
  }
  return value;
}
