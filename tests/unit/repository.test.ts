// T010 — Repository round-trip (insert → query → update → delete) for each entity.
import { beforeEach, describe, expect, test } from 'bun:test';
import { Repository } from '../../src/storage/repository';
import type {
  Artifact,
  DeploymentRecord,
  EvaluationProposal,
  LoadoutDefinition,
  PipelineDefinition,
} from '../../src/core/types';

let repo: Repository;

beforeEach(() => {
  // In-memory DB — fresh schema per test, no disk side effects.
  repo = new Repository({ dbPath: ':memory:' });
});

function sampleArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-1',
    type: 'skill',
    name: 'deep-research',
    path: 'research/deep-research/SKILL.md',
    hash: 'abc123',
    size: 1024,
    metadata: { description: 'A research skill', version: '1.0.0' },
    source: { kind: 'local', path: '/lib/research/deep-research' },
    capabilities: [{ type: 'skill', dialect: 'claude' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'local',
    ...overrides,
  };
}

describe('Repository round-trip', () => {
  test('artifact: insert → get → update → list → delete', () => {
    repo.upsertArtifact(sampleArtifact());
    expect(repo.getArtifact('art-1')?.name).toBe('deep-research');

    repo.upsertArtifact(sampleArtifact({ name: 'deep-research-v2', updatedAt: '2026-06-29T01:00:00Z' }));
    expect(repo.getArtifact('art-1')?.name).toBe('deep-research-v2');
    expect(repo.listArtifacts()).toHaveLength(1);

    expect(repo.deleteArtifact('art-1')).toBe(true);
    expect(repo.getArtifact('art-1')).toBeNull();
  });

  test('loadout: insert → get → update → list → delete', () => {
    const lo: LoadoutDefinition = {
      name: 'coding',
      harnesses: ['claude-code'],
      artifacts: ['art-1'],
      pipelines: [],
      active: false,
    };
    repo.upsertLoadout(lo);
    expect(repo.getLoadout('coding')?.harnesses).toEqual(['claude-code']);

    repo.upsertLoadout({ ...lo, artifacts: ['art-1', 'art-2'] });
    expect(repo.getLoadout('coding')?.artifacts).toHaveLength(2);
    expect(repo.listLoadouts()).toHaveLength(1);

    expect(repo.deleteLoadout('coding')).toBe(true);
    expect(repo.getLoadout('coding')).toBeNull();
  });

  test('deployment: record → get latest → list', () => {
    const rec: DeploymentRecord = {
      id: 'dep-1',
      timestamp: '2026-06-29T00:00:00Z',
      harness: 'claude-code',
      plan: { harness: 'claude-code', operations: [], excluded: [] },
      status: 'applied',
    };
    repo.recordDeployment(rec);
    expect(repo.getLatestDeployment('claude-code')?.id).toBe('dep-1');
    expect(repo.getDeployments('claude-code')).toHaveLength(1);
  });

  test('pipeline: insert → get → update → list → delete', () => {
    const p: PipelineDefinition = {
      name: 'research-flow',
      artifacts: ['art-1', 'art-2'],
      directives: { goal: 'investigate' },
    };
    repo.upsertPipeline(p);
    expect(repo.getPipeline('research-flow')?.artifacts).toHaveLength(2);

    repo.upsertPipeline({ ...p, directives: { goal: 'deep-investigate' } });
    expect(repo.getPipeline('research-flow')?.directives).toEqual({ goal: 'deep-investigate' });
    expect(repo.listPipelines()).toHaveLength(1);

    expect(repo.deletePipeline('research-flow')).toBe(true);
    expect(repo.getPipeline('research-flow')).toBeNull();
  });

  test('proposal: save → get → update status → list filtered → delete', () => {
    const prop: EvaluationProposal = {
      id: 'prop-1',
      type: 'loadout',
      content: { name: 'suggested', artifacts: ['art-1'] },
      rationale: 'grouped by use case',
      status: 'pending',
      createdAt: '2026-06-29T00:00:00Z',
    };
    repo.saveProposal(prop);
    expect(repo.getProposal('prop-1')?.status).toBe('pending');

    repo.saveProposal({ ...prop, status: 'accepted', acceptedAt: '2026-06-29T02:00:00Z' });
    expect(repo.getProposal('prop-1')?.status).toBe('accepted');
    expect(repo.listProposals('accepted')).toHaveLength(1);
    expect(repo.listPropos);
    expect(repo.listProposals('pending')).toHaveLength(0);

    expect(repo.deleteProposal('prop-1')).toBe(true);
    expect(repo.getProposal('prop-1')).toBeNull();
  });

  test('integrity check passes on a fresh database', () => {
    expect(repo.integrityCheck()).toEqual(['ok']);
  });
});
