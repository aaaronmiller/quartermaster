// ─────────────────────────────────────────────────────────────
// Contract — Agent query interface (FR-130, FR-131) and MCP parity (FR-132).
// Every result must be structured + machine-parseable with no human prompt.
// ─────────────────────────────────────────────────────────────

import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Artifact, PipelineDefinition } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';
import { dispatchTool, handleRpc, MCP_TOOLS, isMcpEnabled } from '../../src/mcp/server';
import { queryArtifacts, queryArtifact, queryCompatibility, querySearch } from '../../src/core/query/commands';
import { defaultConfig } from '../../src/core/config/schema';

function artifact(id: string, overrides: Partial<Artifact> = {}): Artifact {
  return {
    id,
    type: 'skill',
    name: id,
    path: `/lib/${id}.md`,
    organizationalPath: 'research',
    hash: id,
    size: 1,
    metadata: { description: `desc for ${id}` },
    source: { kind: 'self', path: `/lib/${id}.md` },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: `self:/lib/${id}.md`,
    ...overrides,
  };
}

function seededRepo(): { repo: Repository; dbPath: string; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'qm-contract-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const repo = new Repository({ dbPath });
  repo.upsertArtifact(artifact('alpha'));
  repo.upsertArtifact(artifact('beta', { type: 'hook', capabilities: [{ type: 'hooks', dialect: 'claude' }] }));
  return { repo, dbPath, dir };
}

function cli(dbPath: string, args: string[]): { ok: boolean; data?: any; reason?: string } {
  // Failure envelopes exit nonzero (NFR-051) but still print parseable JSON to stdout.
  try {
    const out = execFileSync('bun', ['src/cli/index.ts', 'query', ...args, '--json'], {
      cwd: process.cwd(),
      env: { ...process.env, QM_DB_PATH: dbPath },
      encoding: 'utf8',
    });
    return JSON.parse(out);
  } catch (err) {
    const stdout = (err as { stdout?: string }).stdout ?? '';
    return JSON.parse(stdout);
  }
}

// ─── FR-130: stable, structured query surface ────────────────────────────────

test('query list/search/get emit parseable structured JSON (FR-130)', () => {
  const { repo, dbPath } = seededRepo();
  repo.close();

  const list = cli(dbPath, ['list-skills']);
  expect(list.ok).toBe(true);
  // list-skills returns only skill-typed artifacts (beta is a hook).
  expect(list.data.artifacts).toHaveLength(1);
  expect(list.data.artifacts[0].id).toBe('alpha');
  expect(list.data.artifacts[0]).toHaveProperty('required_capabilities');
  expect(list.data.artifacts[0]).toHaveProperty('path');
  expect(list.data.artifacts[0]).toHaveProperty('hash');

  const all = cli(dbPath, ['list']);
  expect(all.ok).toBe(true);
  expect(all.data.artifacts).toHaveLength(2);

  const search = cli(dbPath, ['search', '--capability=hooks']);
  expect(search.ok).toBe(true);
  expect(search.data.artifacts.map((a: any) => a.id)).toEqual(['beta']);

  const get = cli(dbPath, ['get', 'alpha']);
  expect(get.ok).toBe(true);
  expect(get.data.artifact.id).toBe('alpha');
  expect(get.data.artifact.path).toBe('/lib/alpha.md');
  expect(get.data.artifact.hash).toBe('alpha');

  const missing = cli(dbPath, ['get', 'nope']);
  expect(missing.ok).toBe(false); // structured failure envelope with a reason
  expect(typeof missing.reason).toBe('string');
});

// ─── FR-131: agent-requested audit + scaffold ────────────────────────────────

test('query audit returns per-harness verdicts with reasons (FR-131)', () => {
  const { repo, dbPath } = seededRepo();
  repo.close();
  const audit = cli(dbPath, ['audit', 'beta']);
  expect(audit.ok).toBe(true);
  expect(audit.data.artifact_id).toBe('beta');
  expect(Array.isArray(audit.data.verdicts)).toBe(true);
  for (const v of audit.data.verdicts) {
    expect(v).toHaveProperty('harness');
    expect(v).toHaveProperty('status');
    expect(typeof v.reason).toBe('string');
  }
});

test('query scaffold creates a stub and returns its path (FR-131)', () => {
  const { repo, dbPath, dir } = seededRepo();
  repo.close();
  const target = join(dir, 'new-skill', 'SKILL.md');
  const scaffold = cli(dbPath, ['scaffold', 'skill', target]);
  expect(scaffold.ok).toBe(true);
  expect(scaffold.data.path).toBe(target);
  expect(existsSync(target)).toBe(true);
});

// ─── FR-132: MCP ops == CLI ops ───────────────────────────────────────────────

test('MCP is opt-in and disabled by default (FR-132)', () => {
  expect(isMcpEnabled(defaultConfig(), {})).toBe(false);
  expect(isMcpEnabled(defaultConfig(), { QM_MCP_ENABLED: '1' })).toBe(true);
});

test('MCP dispatchTool returns the same data as the underlying query ops (FR-132)', () => {
  const { repo } = seededRepo();

  expect(dispatchTool(repo, 'list_skills')).toEqual(queryArtifacts(repo, { type: 'skill' }));
  expect(dispatchTool(repo, 'search', { capability: 'hooks' })).toEqual(querySearch(repo, { capability: 'hooks' }));
  expect(dispatchTool(repo, 'get', { id: 'alpha' })).toEqual({ artifact: queryArtifact(repo, 'alpha') });
  expect(dispatchTool(repo, 'audit', { id: 'beta' })).toEqual(queryCompatibility(repo, 'beta'));
  repo.close();
});

test('MCP JSON-RPC handshake, tools/list, and tools/call work (FR-132)', () => {
  const { repo } = seededRepo();

  const init = handleRpc(repo, { jsonrpc: '2.0', id: 1, method: 'initialize' });
  expect((init?.result as any).serverInfo.name).toBe('quartermaster');

  const note = handleRpc(repo, { jsonrpc: '2.0', method: 'notifications/initialized' });
  expect(note).toBeNull();

  const tools = handleRpc(repo, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
  expect((tools?.result as any).tools).toHaveLength(MCP_TOOLS.length);

  const call = handleRpc(repo, {
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'list_skills', arguments: {} },
  });
  const text = (call?.result as any).content[0].text;
  expect(JSON.parse(text)).toEqual(queryArtifacts(repo, { type: 'skill' }));
  repo.close();
});

// ─── Ref resolution: skill:// URIs, names, paths, aliases (FR-130) ───────────

test('query get resolves skill:// URIs, bare names, paths, and org paths (FR-130)', () => {
  const { repo, dbPath } = seededRepo();
  repo.close();

  const viaUri = cli(dbPath, ['get', 'skill://alpha']);
  expect(viaUri.ok).toBe(true);
  expect(viaUri.data.artifact.id).toBe('alpha');

  const viaName = cli(dbPath, ['get', 'alpha']);
  expect(viaName.ok).toBe(true);
  expect(viaName.data.artifact.id).toBe('alpha');

  const viaPath = cli(dbPath, ['get', '/lib/alpha.md']);
  expect(viaPath.ok).toBe(true);
  expect(viaPath.data.artifact.id).toBe('alpha');

  const viaOrgPath = cli(dbPath, ['get', 'research']);
  // 'research' is the org path of both fixture artifacts -> ambiguous.
  expect(viaOrgPath.ok).toBe(false);
  expect(typeof viaOrgPath.reason).toBe('string');
  expect(viaOrgPath.reason).toContain('ambiguous');

  const missing = cli(dbPath, ['get', 'skill://nope']);
  expect(missing.ok).toBe(false);
  expect(missing.reason).toContain('not found');
});

test('query get resolves T291 migration aliases', () => {
  const { repo, dbPath } = seededRepo();
  repo.saveArtifactAlias('art_old-alpha', 'alpha', 'test migration', '2026-06-29T00:00:00Z');
  repo.close();
  const viaAlias = cli(dbPath, ['get', 'art_old-alpha']);
  expect(viaAlias.ok).toBe(true);
  expect(viaAlias.data.artifact.id).toBe('alpha');
});

test('ambiguous bare name fails with a reason listing candidates, never a silent pick', () => {
  const { repo, dbPath } = seededRepo();
  repo.upsertArtifact(artifact('gamma', { name: 'alpha' }));
  repo.close();
  const get = cli(dbPath, ['get', 'alpha']);
  expect(get.ok).toBe(false);
  expect(get.reason).toContain('ambiguous');
  expect(get.reason).toContain('alpha');
  expect(get.reason).toContain('gamma');
});

test('query related accepts refs and reports the resolved artifact id', () => {
  const { repo, dbPath } = seededRepo();
  repo.upsertArtifact(artifact('peer'));
  const pipeline: PipelineDefinition = { name: 'p', artifacts: ['alpha', 'peer'], directives: {} };
  repo.upsertPipeline(pipeline);
  repo.close();
  const related = cli(dbPath, ['related', 'skill://alpha']);
  expect(related.ok).toBe(true);
  expect(related.data.artifactId).toBe('alpha');
  expect(Array.isArray(related.data.relationships)).toBe(true);
  expect(related.data.relationships.some((r: any) => r.artifactId === 'peer')).toBe(true);
});

test('query list/search results are deterministically ordered by name then id', () => {
  const { repo, dbPath } = seededRepo();
  repo.upsertArtifact(artifact('zeta', { name: 'zeta' }));
  repo.upsertArtifact(artifact('art_a', { name: 'alpha' })); // name collision, different id
  repo.close();
  const list = cli(dbPath, ['list']);
  const ids = list.data.artifacts.map((a: { id: string }) => a.id);
  // 'alpha' < 'art_a' lexicographically; both sort under name 'alpha' with id tiebreak
  expect(ids[0]).toBe('alpha');
  expect(ids[1]).toBe('art_a');
  expect(ids[2]).toBe('beta');
  expect(ids[3]).toBe('zeta');
});

test('MCP get accepts skill:// refs with the same resolution as the CLI (FR-132 parity)', () => {
  const { repo } = seededRepo();
  const mcp = dispatchTool(repo, 'get', { id: 'skill://alpha' });
  expect(mcp && typeof mcp === 'object' && 'artifact' in mcp).toBe(true);
  if (mcp && typeof mcp === 'object' && 'artifact' in mcp) {
    expect((mcp.artifact as { id: string }).id).toBe('alpha');
  }
  expect(() => dispatchTool(repo, 'get', { id: 'missing' })).toThrow(/not found/);
  repo.close();
});
