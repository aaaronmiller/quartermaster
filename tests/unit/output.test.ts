// T012/T013 — CLI output contract: envelope shape, refusal reasons, flag parsing.
import { describe, expect, test } from 'bun:test';
import { EXIT, failure, parseArgs, success } from '../../src/cli/output';

describe('output envelope', () => {
  test('success carries ok + command + data', () => {
    const e = success('scan', { count: 3 });
    expect(e).toEqual({ ok: true, command: 'scan', data: { count: 3 } });
  });

  test('failure always carries a plain-language reason (NFR-050)', () => {
    const e = failure('deploy', 'harness not configured');
    expect(e.ok).toBe(false);
    expect(e.command).toBe('deploy');
    expect(e.reason).toBe('harness not configured');
  });
});

describe('parseArgs', () => {
  test('splits command, positional, and boolean flags', () => {
    const p = parseArgs(['deploy', 'claude-code', '--json', '--yes']);
    expect(p.command).toBe('deploy');
    expect(p.positional).toEqual(['claude-code']);
    expect(p.flags.json).toBe(true);
    expect(p.flags.yes).toBe(true);
  });

  test('parses --key=value flags', () => {
    const p = parseArgs(['eval', '--turns=5']);
    expect(p.flags.turns).toBe('5');
  });

  test('short flags -h and -v', () => {
    expect(parseArgs(['-h']).flags.help).toBe(true);
    expect(parseArgs(['-v']).flags.version).toBe(true);
  });

  test('empty argv yields empty command', () => {
    expect(parseArgs([]).command).toBe('');
  });
});

describe('exit codes', () => {
  test('distinct codes for ok/usage/notImplemented/internal', () => {
    expect(new Set([EXIT.ok, EXIT.failure, EXIT.usage, EXIT.notImplemented, EXIT.internal]).size).toBe(5);
  });
});
