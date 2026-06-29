// ─────────────────────────────────────────────────────────────
// CLI surface completeness (NFR-051): discoverability, --json, exit codes.
// ─────────────────────────────────────────────────────────────

import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';

function run(args: string[]): { stdout: string; status: number } {
  try {
    const stdout = execFileSync('bun', ['src/cli/index.ts', ...args], { cwd: process.cwd(), encoding: 'utf8' });
    return { stdout, status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? '', status: e.status ?? 1 };
  }
}

const EXPECTED_COMMANDS = [
  'scan', 'list', 'search', 'import', 'sync', 'pin', 'unpin', 'audit', 'plan', 'deploy',
  'rollback', 'status', 'profile', 'new', 'compose', 'loadout', 'pipeline', 'eval',
  'proposal', 'propose', 'guidance', 'safety', 'allowlist', 'query', 'mcp', 'config', 'tui', 'web',
];

test('every registered command is discoverable in qm --help (T252)', () => {
  const { stdout } = run(['--help']);
  for (const cmd of EXPECTED_COMMANDS) {
    expect(stdout).toContain(cmd);
  }
});

test('a failing command exits nonzero with a plain-language reason (T254)', () => {
  const { stdout, status } = run(['query', 'get', 'does-not-exist', '--json']);
  expect(status).not.toBe(0);
  const envelope = JSON.parse(stdout);
  expect(envelope.ok).toBe(false);
  expect(typeof envelope.reason).toBe('string');
  expect(envelope.reason.length).toBeGreaterThan(0);
});

test('read commands emit a parseable JSON envelope with --json (T253)', () => {
  const { stdout } = run(['--version', '--json']);
  const envelope = JSON.parse(stdout);
  expect(envelope.ok).toBe(true);
  expect(envelope).toHaveProperty('command');
});
