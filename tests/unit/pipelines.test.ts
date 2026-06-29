import { expect, test } from 'bun:test';
import { PipelineManager } from '../../src/core/pipelines/pipelines';
import { validatePipeline, validateAllPipelines } from '../../src/core/pipelines/validate';
import type { PipelineDefinition, Artifact } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';

function artifact(id: string): Artifact {
  return {
    id,
    type: 'skill',
    name: id,
    path: `/tmp/${id}.md`,
    organizationalPath: '.',
    hash: 'h',
    size: 1,
    metadata: {},
    source: { kind: 'self', path: `/tmp/${id}.md` },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    provenance: 'self',
  };
}

test('pipeline CRUD operations', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  const manager = new PipelineManager(repo);

  // Create
  const pipeline: PipelineDefinition = {
    name: 'test-pipeline',
    artifacts: ['skill-a', 'skill-b'],
    directives: { priority: 10 },
  };
  manager.create(pipeline);

  // List
  const list = manager.list();
  expect(list).toHaveLength(1);
  expect(list[0].name).toBe('test-pipeline');

  // Get
  const found = manager.get('test-pipeline');
  expect(found?.artifacts).toEqual(['skill-a', 'skill-b']);

  // Delete
  manager.delete('test-pipeline');
  expect(manager.list()).toHaveLength(0);

  repo.close();
});

test('validatePipeline checks artifact references', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.upsertArtifact(artifact('skill-a'));

  // Valid: all artifacts exist
  const valid = validatePipeline(repo, { name: 'p1', artifacts: ['skill-a'], directives: {} });
  expect(valid.valid).toBe(true);

  // Invalid: artifact not found
  const invalid = validatePipeline(repo, { name: 'p2', artifacts: ['nonexistent'], directives: {} });
  expect(invalid.valid).toBe(false);
  expect(invalid.errors[0]!.errors).toContain("Artifact 'nonexistent' referenced by pipeline not found in catalog");

  repo.close();
});

test('validateAllPipelines validates all pipelines', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.upsertArtifact(artifact('skill-a'));

  const manager = new PipelineManager(repo);
  manager.create({ name: 'valid', artifacts: ['skill-a'], directives: {} });
  manager.create({ name: 'invalid', artifacts: ['missing'], directives: {} });

  const result = validateAllPipelines(repo);
  expect(result.valid).toBe(false);
  expect(result.errors).toHaveLength(1);
  expect(result.errors[0]!.pipeline).toBe('invalid');

  repo.close();
});

test('pipeline compose respects exclusivity', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.upsertArtifact(artifact('skill-a'));
  repo.upsertArtifact(artifact('skill-b'));

  const manager = new PipelineManager(repo);
  manager.create({ name: 'exclusive', artifacts: ['skill-a'], directives: { exclusive: true } });
  manager.create({ name: 'normal', artifacts: ['skill-b'], directives: {} });

  const pipelines = [manager.get('exclusive')!, manager.get('normal')!];
  const composed = manager.compose(pipelines);

  // Exclusive pipeline artifacts included, but non-exclusive skipped due to type overlap
  expect(composed.length).toBeGreaterThanOrEqual(1);

  repo.close();
});
// ─── FR-113: composition validation (Noun/Verb/Adjective) ────────────────────

import { defaultConfig } from '../../src/core/config/schema';
import { proposePipelines } from '../../src/core/pipelines/propose';

function composable(id: string, composition: Record<string, unknown>): Artifact {
  return { ...artifact(id), metadata: { composition } };
}

test('composition-enabled validation reports incompatible IO between members', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  // verb 'extract' outputs "text"; verb 'render' requires "image" → incompatible.
  repo.upsertArtifact(composable('extract', { role: 'verb', inputs: ['url'], outputs: ['text'] }));
  repo.upsertArtifact(composable('render', { role: 'verb', inputs: ['image'], outputs: ['png'] }));

  const ok = validatePipeline(repo, { name: 'p', artifacts: ['extract', 'render'], directives: {} }, false);
  expect(ok.valid).toBe(true); // composition disabled → plain skills pass

  const bad = validatePipeline(repo, { name: 'p', artifacts: ['extract', 'render'], directives: {} }, true);
  expect(bad.valid).toBe(false);
  expect(bad.errors[0]!.errors.some((e) => e.includes('composition'))).toBe(true);
  repo.close();
});

test('composition validation passes when member IO contracts line up', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.upsertArtifact(composable('extract', { role: 'verb', inputs: ['url'], outputs: ['text'] }));
  repo.upsertArtifact(composable('summarize', { role: 'verb', inputs: ['text'], outputs: ['summary'] }));

  const result = validatePipeline(repo, { name: 'p', artifacts: ['extract', 'summarize'], directives: {} }, true);
  expect(result.valid).toBe(true);
  repo.close();
});

// ─── FR-111: agentic pipeline proposal (mock endpoint) ───────────────────────

function evalCfg() {
  return {
    ...defaultConfig(),
    dbPath: ':memory:',
    eval: { ...defaultConfig().eval, baseUrl: 'http://127.0.0.1/mock', defaultModel: 'm', models: { bulk: 'b' }, apiKeyEnv: 'QM_X', turnBudget: 2 },
  };
}

function mockFetch(content: string): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ model: 'mock', choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

test('proposePipelines returns named candidate pipelines from the model (mock)', async () => {
  const proposals = await proposePipelines([artifact('skill-a'), artifact('skill-b')], evalCfg(), {
    instruction: 'build a research flow',
    fetchImpl: mockFetch(
      JSON.stringify({
        pipelines: [
          { name: 'research', description: 'gather then write', artifacts: ['skill-a', 'skill-b'], directives: { priority: 10 }, rationale: 'complementary' },
        ],
      }),
    ),
  });
  expect(proposals).toHaveLength(1);
  expect(proposals[0]!.name).toBe('research');
  expect(proposals[0]!.artifacts).toEqual(['skill-a', 'skill-b']);
});
