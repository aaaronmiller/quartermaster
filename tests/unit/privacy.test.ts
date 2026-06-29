// ─────────────────────────────────────────────────────────────
// Privacy NFRs (NFR-030 no telemetry, NFR-031 no leaked credentials).
// ─────────────────────────────────────────────────────────────

import { expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { redactSecrets, resolveApiKey } from '../../src/core/config/secrets';
import { defaultConfig } from '../../src/core/config/schema';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

// ─── NFR-030: no telemetry / analytics / usage reporting ─────────────────────

test('no source file references telemetry or analytics endpoints (NFR-030)', () => {
  const files = walk('src');
  // Real telemetry SDKs / endpoints — not the word "telemetry" in a comment
  // (e.g. server.ts documents that it makes "no telemetry calls").
  const banned = [
    /sendBeacon/,
    /google-analytics/,
    /segment\.io/,
    /amplitude/,
    /mixpanel/,
    /posthog/,
    /track\(['"]/,
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    if (banned.some((re) => re.test(text))) offenders.push(file);
  }
  expect(offenders).toEqual([]);
});

test('outbound fetch is confined to import/sync and the eval gateway (NFR-030)', () => {
  const files = walk('src');
  const allowed = [
    join('src', 'core', 'evaluation', 'gateway.ts'),
    join('src', 'core', 'sources'),
    join('src', 'core', 'pipelines', 'propose.ts'), // routes through the gateway
  ];
  const offenders: string[] = [];
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    // Match real network fetch calls, not the test's own helpers.
    if (/\bfetchImpl\b|await fetch\(|= fetch\(/.test(text)) {
      if (!allowed.some((a) => file.startsWith(a) || file === a)) offenders.push(file);
    }
  }
  expect(offenders).toEqual([]);
});

// ─── NFR-031: credentials never serialized ───────────────────────────────────

test('redactSecrets masks credential-named fields at any depth (NFR-031)', () => {
  const blob = {
    eval: { apiKey: 'sk-secret-123', baseUrl: 'http://x' },
    nested: { token: 'tok-abc', deep: { authorization: 'Bearer zzz' } },
    safe: 'visible',
  };
  const redacted = redactSecrets(blob);
  const serialized = JSON.stringify(redacted);
  expect(serialized).not.toContain('sk-secret-123');
  expect(serialized).not.toContain('tok-abc');
  expect(serialized).not.toContain('Bearer zzz');
  expect(serialized).toContain('visible');
});

test('the default config holds no credential, only an env-var name (NFR-031)', () => {
  const cfg = defaultConfig();
  expect(JSON.stringify(cfg)).not.toMatch(/sk-|secret|Bearer /);
  // The key is resolved from the environment at call time, never persisted.
  const key = resolveApiKey(cfg, { [cfg.eval.apiKeyEnv]: 'live-secret' });
  expect(key).toBe('live-secret');
  expect(JSON.stringify(cfg)).not.toContain('live-secret');
});
