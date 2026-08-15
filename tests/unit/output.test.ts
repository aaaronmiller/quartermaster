// T012/T013 — CLI output contract: envelope shape, refusal reasons, flag parsing.
import { describe, expect, test } from 'bun:test';
import { EXIT, emit, failure, parseArgs, success } from '../../src/cli/output';

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

describe('value-flag space form and JSON envelope', () => {
  test('--flag <value> space form consumes the next argv for known value flags', () => {
    const p = parseArgs(['list', '--type', 'skill', '--capability', 'hooks']);
    expect(p.command).toBe('list');
    expect(p.flags.type).toBe('skill');
    expect(p.flags.capability).toBe('hooks');
    expect(p.positional).toEqual([]);
  });

  test('a value flag followed by another flag throws instead of silently misreading', () => {
    expect(() => parseArgs(['list', '--type', '--json'])).toThrow(/requires a value/);
  });

  test('missing value for a value flag throws', () => {
    expect(() => parseArgs(['new', 'skill', 'x', '--root'])).toThrow(/requires a value/);
  });

  test('--json=true and --json=1 parse as string forms', () => {
    expect(parseArgs(['list', '--json=true']).flags.json).toBe('true');
    expect(parseArgs(['list', '--json=1']).flags.json).toBe('1');
  });
});

describe('human rendering (renderHuman via emit)', () => {
  function capture(fn: () => void): string[] {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (s: string) => logs.push(s);
    try { fn(); } finally { console.log = orig; }
    return logs;
  }

  test('artifact lists render summary + rows, never raw JSON', () => {
    const logs = capture(() => emit(success('list', { count: 2, artifacts: [
      { id: 'a', type: 'skill', name: 'alpha', org_path: 'research/alpha' },
      { id: 'b', type: 'hook', name: 'beta', org_path: 'hooks/beta' },
    ] }), false));
    expect(logs[0]).toContain('2 artifact(s)');
    expect(logs[0]).toContain('alpha');
    expect(logs[0]).not.toContain('"id"');
  });

  test('deploy plans render summary + operations + exclusions', () => {
    const logs = capture(() => emit(success('deploy', { mode: 'dry-run', plan: {
      operations: [{ sourcePath: '/lib/s', targetPath: '/t/s', method: 'link', transform: 'flatten' }],
      excluded: [{ artifactId: 'b', reason: 'hooks unsupported' }],
    } }), false));
    expect(logs[0]).toContain('Dry-run plan');
    expect(logs[0]).toContain('+ /lib/s -> /t/s');
    expect(logs[0]).toContain('transform=flatten');
    expect(logs[0]).toContain('excluded');
  });

  test('harness status renders in-sync/drifted/orphaned lines', () => {
    const logs = capture(() => emit(success('status', { harness: 'claude-code', deployed: [
      { artifactId: 'a', targetPath: '/t/a', method: 'link', inSync: true },
    ], orphaned: ['/x/orphan.md'] }), false));
    expect(logs[0]).toContain('1 deployed, 1 orphaned');
    expect(logs[0]).toContain('in-sync');
    expect(logs[0]).toContain('orphaned: /x/orphan.md');
  });

  test('config-like payloads degrade to key: value', () => {
    const logs = capture(() => emit(success('config', { roots: ['/r'], threshold: 0.6 }), false));
    expect(logs[0]).toContain('roots: ["/r"]');
    expect(logs[0]).toContain('threshold: 0.6');
  });
});

describe('exit-code classification (emit)', () => {
  test('usage-prefixed failures exit 2, domain failures exit 1', () => {
    expect(emit(failure('new', 'usage: qm new <type> <path>'), false)).toBe(EXIT.usage);
    expect(emit(failure('deploy', 'profile or group not found: x'), false)).toBe(EXIT.failure);
    expect(emit(success('list', { count: 0 }), false)).toBe(EXIT.ok);
  });

  test('unknown-command reason exits 2', () => {
    expect(emit(failure('bogus', "unknown command 'bogus'. Run `qm --help` for usage."), false)).toBe(EXIT.usage);
  });
});

describe('deployment/rollback human rendering', () => {
  function capture(fn: () => void): string[] {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (s: string) => logs.push(s);
    try { fn(); } finally { console.log = orig; }
    return logs;
  }

  test('dry-run plan tells the human how to apply', () => {
    const logs = capture(() => emit(success('deploy', { mode: 'dry-run', requiresConfirmation: true, plan: {
      operations: [{ sourcePath: '/s', targetPath: '/t', method: 'copy' }],
      excluded: [],
    } }), false));
    expect(logs[0]).toContain('--yes');
    expect(logs[0]).toContain('+ /s -> /t');
  });

  test('rollback with no id lists recent deployments + usage', () => {
    const logs = capture(() => emit(success('rollback', { usage: 'qm rollback <deployId>', deployments: [
      { id: 'dep_1', harness: 'codex', timestamp: '2026-08-14T10:00:00Z', status: 'applied', operations: 12 },
    ] }), false));
    expect(logs[0]).toContain('dep_1');
    expect(logs[0]).toContain('codex');
    expect(logs[0]).toContain('qm rollback <deployId>');
  });
});
