import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  computeCompatibilityMatrix,
  computeVerdict,
  summarizeMatrix,
} from '../../src/core/audit/auditor';
import { loadBuiltInProfiles } from '../../src/core/profiles/profile-registry';
import type { Artifact, HarnessProfile } from '../../src/core/types';
import { tempRepo } from '../helpers';

function artifact(id: string): Artifact {
  return {
    id,
    type: 'skill',
    name: `Skill ${id}`,
    path: `/library/${id}/SKILL.md`,
    organizationalPath: id,
    hash: `hash-${id}`,
    size: 1,
    metadata: {},
    source: { kind: 'self', path: `/library/${id}/SKILL.md` },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: `self:/library/${id}/SKILL.md`,
  };
}

function tenProfiles(): HarnessProfile[] {
  const builtins = loadBuiltInProfiles();
  return Array.from({ length: 10 }, (_, i) => ({
    ...builtins[i % builtins.length]!,
    id: `harness-${i}`,
    name: `Harness ${i}`,
  }));
}

test('compatibility matrix of 1000 artifacts x 10 harnesses computes under 5s', () => {
  const artifacts = Array.from({ length: 1000 }, (_, i) => artifact(`a${i}`));
  const profiles = tenProfiles();
  const start = performance.now();
  const matrix = computeCompatibilityMatrix(artifacts, profiles);
  const elapsed = performance.now() - start;
  expect(matrix).toHaveLength(1000);
  expect(matrix[0]).toHaveLength(10);
  expect(summarizeMatrix(matrix).total).toBe(10000);
  expect(elapsed).toBeLessThan(5000);
});

test('qm audit --matrix shows verdicts and manual overrides', () => {
  const { repo, dir } = tempRepo();
  const skill = artifact('a1');
  repo.upsertArtifact(skill);
  repo.close();

  const env = { ...process.env, QM_DB_PATH: `${dir}/catalog.sqlite` };
  const run = (args: string[]) => {
    const out = execFileSync('bun', ['src/cli/index.ts', 'audit', ...args, '--json'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    });
    return JSON.parse(out) as {
      ok: boolean;
      data?: { matrix?: Array<Array<{ artifactId: string; harness: string; verdict: string; reason: string }>> };
    };
  };

  const before = run(['--matrix']);
  expect(before.ok).toBe(true);
  expect(before.data?.matrix?.flat().some((cell) => cell.artifactId === 'a1')).toBe(true);

  const override = run([
    'override',
    'a1',
    'codex',
    '--status=incompatible',
    '--note=operator blocked',
  ]);
  expect(override.ok).toBe(true);

  const after = run(['--matrix']);
  const codexCell = after.data?.matrix?.flat().find((cell) => cell.artifactId === 'a1' && cell.harness === 'codex');
  expect(codexCell?.verdict).toBe('incompatible');
  expect(codexCell?.reason).toContain('manual override');
});

test('deployment honors manual override through computeVerdict override map', () => {
  const overrides = new Map([['a1', new Map([['custom', { status: 'deployable' as const, note: 'approved' }]])]]);
  const result = computeVerdict(
    artifact('a1'),
    {
      id: 'custom',
      name: 'Custom',
      version: 1,
      guidanceFilename: 'AGENTS.md',
      artifactTypes: [],
      capabilities: [],
      deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
    },
    overrides,
  );
  expect(result.verdict).toBe('deployable');
  expect(result.reason).toContain('manual override');
});
