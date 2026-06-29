import { afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { defaultConfig, type QuartermasterConfig } from '../../src/core/config/schema';
import { compareArtifacts } from '../../src/core/evaluation/compare';
import { resolveGatewayConfig, singleTurn } from '../../src/core/evaluation/gateway';
import { gradeArtifact } from '../../src/core/evaluation/grade';
import { investigateArtifact } from '../../src/core/evaluation/investigate';
import type { Artifact } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';

const servers: Array<{ stop: () => void; url: string; seen: unknown[] }> = [];

afterEach(() => {
  while (servers.length > 0) servers.pop()?.stop();
});

function cfg(baseUrl = 'http://127.0.0.1/mock'): QuartermasterConfig {
  return {
    ...defaultConfig(),
    dbPath: ':memory:',
    eval: {
      ...defaultConfig().eval,
      baseUrl,
      defaultModel: 'default-model',
      models: { bulk: 'bulk-model', deep: 'deep-model' },
      apiKeyEnv: 'QM_TEST_EVAL_KEY',
      turnBudget: 2,
    },
  };
}

function artifact(path: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'skill-a',
    type: 'skill',
    name: 'Skill A',
    path,
    organizationalPath: '.',
    hash: 'hash',
    size: 1,
    metadata: { description: 'Useful skill', useCase: 'coding' },
    source: { kind: 'self', path },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: `self:${path}`,
    ...overrides,
  };
}

function mockFetch(content: string): typeof fetch {
  return async () =>
    new Response(JSON.stringify({ model: 'mock-model', choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
}

function startServer(content: string) {
  const seen: unknown[] = [];
  const server = Bun.serve({
    port: 0,
    fetch: async (request) => {
      seen.push(await request.json());
      return Response.json({ model: 'server-model', choices: [{ message: { content } }] });
    },
  });
  const entry = { stop: () => server.stop(true), url: `http://127.0.0.1:${server.port}`, seen };
  servers.push(entry);
  return entry;
}

test('gateway reads endpoint and per-task model from config without exposing credentials', async () => {
  const resolved = resolveGatewayConfig(cfg(), 'bulk', { QM_TEST_EVAL_KEY: 'secret-value' });
  expect(resolved.baseUrl).toBe('http://127.0.0.1/mock');
  expect(resolved.model).toBe('bulk-model');
  expect(JSON.stringify(defaultConfig())).not.toContain('secret-value');
  const response = await singleTurn('hello', resolved, {
    fetchImpl: mockFetch('{"ok":true}'),
  });
  expect(response.model).toBe('mock-model');
});

test('grade scores caller-named categories in single-turn metadata mode', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-eval-'));
  const source = join(dir, 'skill.md');
  writeFileSync(source, '# full body should not be read\n');
  const result = await gradeArtifact(artifact(source), ['quality', 'safety'], cfg(), {
    fetchImpl: mockFetch(
      JSON.stringify({
        categories: [
          { category: 'quality', score: 0.9, rationale: 'clear' },
          { category: 'safety', score: 0.8, rationale: 'safe' },
        ],
        rationale: 'strong',
      }),
    ),
  });
  expect(result.categories.map((category) => category.category)).toEqual(['quality', 'safety']);
  expect(result.bodyRead).toBe(false);
});

test('compare returns ranked artifacts with reasons', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-eval-'));
  const result = await compareArtifacts(
    [artifact(join(dir, 'a.md')), artifact(join(dir, 'b.md'), { id: 'skill-b' })],
    cfg(),
    {
      fetchImpl: mockFetch(
        JSON.stringify({
          ranked: [
            { artifactId: 'skill-b', rank: 1, reason: 'more specific' },
            { artifactId: 'skill-a', rank: 2, reason: 'broader' },
          ],
          recommendation: 'skill-b',
        }),
      ),
    },
  );
  expect(result.ranked[0]?.artifactId).toBe('skill-b');
});

test('investigation reads full body and fails closed on turn budget', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-eval-'));
  const source = join(dir, 'skill.md');
  writeFileSync(source, '# body\n');
  const result = await investigateArtifact(artifact(source), cfg(), 2, {
    fetchImpl: mockFetch(JSON.stringify({ summary: 'read body' })),
  });
  expect(result.filesRead).toEqual([source]);
  await expect(investigateArtifact(artifact(source), cfg(), 3, { fetchImpl: mockFetch('{}') })).rejects.toThrow(
    'turn budget exceeded',
  );
});

test('qm eval config renders through CLI with a local mock endpoint', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-eval-cli-'));
  const sourceDir = join(dir, 'library');
  mkdirSync(sourceDir, { recursive: true });
  const source = join(sourceDir, 'skill.md');
  writeFileSync(source, '# skill\n');
  const server = startServer(
    JSON.stringify({
      categories: [{ category: 'quality', score: 0.7, rationale: 'ok' }],
      rationale: 'graded',
    }),
  );
  writeFileSync(
    join(dir, 'quartermaster.json'),
    JSON.stringify({
      dbPath: join(dir, 'catalog.sqlite'),
      eval: { baseUrl: server.url, defaultModel: 'cli-model', models: { bulk: 'cli-bulk' }, apiKeyEnv: 'QM_TEST_EVAL_KEY' },
    }),
  );
  const repo = new Repository({ dbPath: join(dir, 'catalog.sqlite') });
  repo.upsertArtifact(artifact(source));
  repo.close();

  const cli = resolve('src/cli/index.ts');
  const configOut = JSON.parse(execFileSync('bun', [cli, 'eval', 'config', '--json'], { cwd: dir, encoding: 'utf8', timeout: 0 }));
  expect(configOut.data.baseUrl).toBe(server.url);
});
