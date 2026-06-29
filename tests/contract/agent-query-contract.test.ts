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
import type { Artifact } from '../../src/core/types';
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
  expect(list.data.artifacts).toHaveLength(2);
  expect(list.data.artifacts[0]).toHaveProperty('required_capabilities');

  const search = cli(dbPath, ['search', '--capability=hooks']);
  expect(search.ok).toBe(true);
  expect(search.data.artifacts.map((a: any) => a.id)).toEqual(['beta']);

  const get = cli(dbPath, ['get', 'alpha']);
  expect(get.ok).toBe(true);
  expect(get.data.artifact.id).toBe('alpha');

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

  expect(dispatchTool(repo, 'list_skills')).toEqual(queryArtifacts(repo));
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
  expect(JSON.parse(text)).toEqual(queryArtifacts(repo));
  repo.close();
});
