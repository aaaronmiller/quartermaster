import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CompositionChain } from '../../src/core/composition';
import { validateComposition } from '../../src/core/composition';

function validChain(): CompositionChain {
  return {
    artifacts: [
      { id: 'brief', role: 'noun', inputs: [], outputs: ['brief'], enhanceable: true },
      { id: 'draft', role: 'verb', inputs: ['brief'], outputs: ['draft'], enhanceable: true },
      { id: 'polish', role: 'adjective', inputs: [], outputs: [] },
    ],
    edges: [
      { from: 'brief', to: 'draft' },
      { from: 'polish', to: 'draft' },
    ],
  };
}

test('validates chained input/output compatibility', () => {
  const chain = validChain();
  chain.artifacts[1] = { id: 'draft', role: 'verb', inputs: ['transcript'], outputs: ['draft'] };
  const result = validateComposition(chain, { enabled: true });
  expect(result.ok).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toContain('incompatible-io');
});

test('detects cycles in composition chains', () => {
  const chain = validChain();
  chain.edges.push({ from: 'draft', to: 'brief' });
  const result = validateComposition(chain, { enabled: true });
  expect(result.ok).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toContain('cycle');
});

test('adjectives attach only to enhanceable artifacts', () => {
  const chain = validChain();
  chain.artifacts[1] = { id: 'draft', role: 'verb', inputs: ['brief'], outputs: ['draft'] };
  const result = validateComposition(chain, { enabled: true });
  expect(result.ok).toBe(false);
  expect(result.issues.map((issue) => issue.code)).toContain('invalid-adjective-attachment');
});

test('disabled composition module reports skipped and does not block', () => {
  const result = validateComposition(
    {
      artifacts: [
        { id: 'a', role: 'noun', inputs: ['missing'], outputs: [] },
        { id: 'b', role: 'verb', inputs: ['other'], outputs: [] },
      ],
      edges: [{ from: 'a', to: 'b' }],
    },
    { enabled: false },
  );
  expect(result).toEqual({ ok: true, disabled: true, issues: [] });
});

test('qm compose validate runs validation from CLI', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-compose-'));
  const chainPath = join(dir, 'chain.json');
  writeFileSync(chainPath, JSON.stringify(validChain()));
  const out = execFileSync('bun', ['src/cli/index.ts', 'compose', 'validate', chainPath, '--json'], {
    cwd: process.cwd(),
    env: { ...process.env, QM_COMPOSITION_ENABLED: 'true' },
    encoding: 'utf8',
  });
  const parsed = JSON.parse(out) as { ok: boolean; data?: { ok: boolean; disabled: boolean } };
  expect(parsed.ok).toBe(true);
  expect(parsed.data).toEqual({ ok: true, disabled: false, issues: [] });
});
