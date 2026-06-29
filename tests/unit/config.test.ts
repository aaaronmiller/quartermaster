// T015f — config precedence (defaults < global < project < env), redaction, validation.
import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError, loadConfig } from '../../src/core/config/load';
import { defaultConfig } from '../../src/core/config/schema';
import { REDACTED, redactSecrets, resolveApiKey } from '../../src/core/config/secrets';

const dir = mkdtempSync(join(tmpdir(), 'qm-config-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function writeJson(name: string, obj: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(obj));
  return path;
}

describe('config precedence', () => {
  test('defaults apply when nothing else is set', () => {
    const cfg = loadConfig({ globalPath: join(dir, 'absent.json'), cwd: dir, env: {} });
    expect(cfg.safety.threshold).toBe(0.6);
    expect(cfg.eval.turnBudget).toBe(8);
  });

  test('global overrides defaults; project overrides global; env overrides project', () => {
    const globalPath = writeJson('global.json', { safety: { threshold: 0.5 }, harnesses: ['a'] });
    const projectPath = writeJson('project.json', { safety: { threshold: 0.7 } });

    const cfg = loadConfig({
      globalPath,
      projectPath,
      cwd: dir,
      env: { QM_SAFETY_THRESHOLD: '0.9' },
    });

    // env wins for threshold
    expect(cfg.safety.threshold).toBe(0.9);
    // harnesses only set at global level, survives merge
    expect(cfg.harnesses).toEqual(['a']);
  });

  test('deep merge preserves untouched sibling fields', () => {
    const globalPath = writeJson('g2.json', { eval: { baseUrl: 'http://x' } });
    const cfg = loadConfig({ globalPath, cwd: dir, env: {} });
    expect(cfg.eval.baseUrl).toBe('http://x');
    expect(cfg.eval.turnBudget).toBe(8); // default preserved
  });
});

describe('config validation', () => {
  test('out-of-range threshold throws ConfigError with plain reason', () => {
    const bad = { ...defaultConfig(), safety: { threshold: 5, allowlist: [] } };
    expect(() => loadConfig({ defaults: bad, globalPath: join(dir, 'none.json'), cwd: dir, env: {} })).toThrow(
      ConfigError,
    );
  });
});

describe('secrets', () => {
  test('config never stores the key itself, only the env var name', () => {
    const cfg = defaultConfig();
    expect(JSON.stringify(cfg)).not.toContain('QM_EVAL_API_KEY=');
    expect(cfg.eval.apiKeyEnv).toBe('QM_EVAL_API_KEY');
  });

  test('resolveApiKey reads from the named env var', () => {
    const cfg = defaultConfig();
    expect(resolveApiKey(cfg, { QM_EVAL_API_KEY: 'sk-test' })).toBe('sk-test');
    expect(resolveApiKey(cfg, {})).toBeUndefined();
  });

  test('redactSecrets masks credential-named fields at any depth', () => {
    const masked = redactSecrets({ provider: 'x', apiKey: 'sk-live', nested: { token: 'abc' } });
    expect(masked.apiKey).toBe(REDACTED);
    expect(masked.nested.token).toBe(REDACTED);
    expect(masked.provider).toBe('x');
  });
});
