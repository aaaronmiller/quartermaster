import { describe, expect, test } from 'bun:test';
import {
  computeCompatibilityMatrix,
  computeVerdict,
  loadVerdictOverrides,
  saveVerdictOverride,
  summarizeMatrix,
} from '../../src/core/audit/auditor';
import { TransformRegistry } from '../../src/core/audit/transforms';
import { loadBuiltInProfiles } from '../../src/core/profiles/profile-registry';
import type { Artifact, HarnessProfile } from '../../src/core/types';
import { tempRepo } from '../helpers';

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'a1',
    type: 'skill',
    name: 'Skill',
    path: '/library/research/SKILL.md',
    organizationalPath: 'research',
    hash: 'hash',
    size: 1,
    metadata: {},
    source: { kind: 'self', path: '/library/research/SKILL.md' },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'self:/library/research/SKILL.md',
    ...overrides,
  };
}

function profile(id = 'custom'): HarnessProfile {
  return {
    id,
    name: id,
    version: 1,
    guidanceFilename: 'AGENTS.md',
    artifactTypes: [
      {
        type: 'skill',
        locations: { global: '~/.custom/skills', project: '.custom/skills' },
        flat: false,
        configFormat: null,
      },
      {
        type: 'mcp-config',
        locations: { global: '~/.custom/config.json', project: '.custom/config.json' },
        flat: true,
        configFormat: 'toml',
      },
    ],
    capabilities: [
      { type: 'skill', dialects: ['agent-md'] },
      { type: 'mcp', dialects: ['toml'] },
    ],
    deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
  };
}

describe('compatibility verdicts (FR-030/031)', () => {
  test('computeVerdict is pure and deterministic', () => {
    const a = artifact();
    const p = profile();
    expect(computeVerdict(a, p)).toEqual(computeVerdict(a, p));
  });

  test('unsupported type and capability return incompatible with specific reasons', () => {
    const p = profile();
    const unsupportedType = computeVerdict(artifact({ type: 'hook' }), p);
    expect(unsupportedType.verdict).toBe('incompatible');
    expect(unsupportedType.reason).toContain("type 'hook'");

    const unsupportedCapability = computeVerdict(
      artifact({ capabilities: [{ type: 'hooks', dialect: 'custom' }] }),
      p,
    );
    expect(unsupportedCapability.verdict).toBe('incompatible');
    expect(unsupportedCapability.reason).toContain("capability 'hooks'");
  });

  test('supported type and capabilities are deployable', () => {
    expect(computeVerdict(artifact(), profile()).verdict).toBe('deployable');
  });
});

describe('transform verdicts (FR-032)', () => {
  test('transform registry enumerates flatten and config-translate', () => {
    const names = new TransformRegistry().list();
    expect(names).toContain('flatten');
    expect(names).toContain('config-translate');
  });

  test('nested artifact targeting a flat profile requires flatten', () => {
    const codex = loadBuiltInProfiles().find((p) => p.id === 'codex')!;
    const verdict = computeVerdict(artifact(), codex);
    expect(verdict.verdict).toBe('transform');
    expect(verdict.transformation).toBe('flatten');
  });

  test('config format mismatch uses config-translate', () => {
    const codex = loadBuiltInProfiles().find((p) => p.id === 'codex')!;
    const verdict = computeVerdict(
      artifact({
        type: 'mcp-config',
        path: '/library/mcp/filesystem.mcp.json',
        organizationalPath: '.',
        metadata: { configFormat: 'claude-mcp-json' },
        capabilities: [{ type: 'mcp', dialect: 'single-server' }],
      }),
      codex,
    );
    expect(verdict.verdict).toBe('transform');
    expect(verdict.transformation).toBe('config-translate');
  });

  test('dialect mismatch transforms only when a translator exists', () => {
    const withTranslator = computeVerdict(
      artifact({
        type: 'mcp-config',
        organizationalPath: '.',
        capabilities: [{ type: 'mcp', dialect: 'json' }],
      }),
      profile(),
    );
    expect(withTranslator.verdict).toBe('transform');
    expect(withTranslator.transformation).toBe('translate-json-to-toml');

    const antigravity = loadBuiltInProfiles().find((p) => p.id === 'antigravity')!;
    const withoutTranslator = computeVerdict(
      artifact({ type: 'hook', capabilities: [{ type: 'hooks', dialect: 'claude' }] }),
      antigravity,
    );
    expect(withoutTranslator.verdict).toBe('incompatible');
    expect(withoutTranslator.reason).toContain("dialect 'claude'");
  });
});

describe('matrix and overrides (FR-033/034)', () => {
  test('computeCompatibilityMatrix returns an artifact by profile grid', () => {
    const matrix = computeCompatibilityMatrix([artifact(), artifact({ id: 'a2' })], [profile(), profile('custom2')]);
    expect(matrix).toHaveLength(2);
    expect(matrix[0]).toHaveLength(2);
    expect(summarizeMatrix(matrix).total).toBe(4);
  });

  test('persisted manual override supersedes computed verdict and labels reason', () => {
    const { repo } = tempRepo();
    saveVerdictOverride(repo, {
      artifactId: 'a1',
      harness: 'custom',
      status: 'incompatible',
      note: 'operator blocked',
    });
    const verdict = computeVerdict(artifact(), profile(), loadVerdictOverrides(repo));
    expect(verdict.verdict).toBe('incompatible');
    expect(verdict.reason).toContain('manual override');
    expect(verdict.reason).toContain('operator blocked');
    repo.close();
  });
});

describe('self-authored audit parity (FR-051)', () => {
  test('self-authored hooks are audited by the same capability/profile rules as imported hooks', () => {
    const hook = artifact({
      id: 'self-hook',
      type: 'hook',
      name: 'Self Hook',
      path: '/library/hooks/preflight.hook.yaml',
      organizationalPath: 'hooks',
      source: { kind: 'self', path: '/library/hooks/preflight.hook.yaml' },
      capabilities: [{ type: 'hooks', dialect: 'claude' }],
      provenance: 'self:/library/hooks/preflight.hook.yaml',
    });
    const codex = loadBuiltInProfiles().find((p) => p.id === 'codex')!;
    const claude = loadBuiltInProfiles().find((p) => p.id === 'claude-code')!;
    expect(computeVerdict(hook, codex).verdict).toBe('incompatible');
    expect(computeVerdict(hook, claude).verdict).toBe('deployable');
  });
});
