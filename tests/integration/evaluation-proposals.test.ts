import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { proposeLoadouts } from '../../src/core/evaluation/propose-loadouts';
import { acceptProposal, createProposal, editProposal, rejectProposal } from '../../src/core/evaluation/proposals';
import type { Artifact, LoadoutDefinition } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';

function artifact(id: string, useCase: string): Artifact {
  return {
    id,
    type: 'skill',
    name: id,
    path: `/tmp/${id}.md`,
    organizationalPath: '.',
    hash: id,
    size: 1,
    metadata: { useCase },
    source: { kind: 'self', path: `/tmp/${id}.md` },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'self',
  };
}

test('proposal creation has no deployment or loadout side effects until accept', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  const content: LoadoutDefinition = {
    name: 'coding',
    harnesses: [],
    artifacts: ['a'],
    pipelines: [],
    active: false,
  };
  const proposal = createProposal(repo, 'loadout', content, 'reviewable loadout');
  expect(repo.listProposals()).toHaveLength(1);
  expect(repo.listDeployments()).toHaveLength(0);
  expect(repo.listLoadouts()).toHaveLength(0);

  acceptProposal(repo, proposal.id);
  expect(repo.getLoadout('coding')?.artifacts).toEqual(['a']);
  repo.close();
});

test('proposal edit and reject are explicit lifecycle steps', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  const proposal = createProposal(repo, 'evaluation', { a: 1 }, 'review');
  editProposal(repo, proposal.id, { a: 2 });
  expect(repo.getProposal(proposal.id)?.content).toEqual({ a: 2 });
  rejectProposal(repo, proposal.id, 'not useful');
  expect(repo.getProposal(proposal.id)?.status).toBe('rejected');
  repo.close();
});

test('loadout proposal groups catalog by use case and CLI can render/accept lifecycle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-proposal-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const repo = new Repository({ dbPath });
  repo.upsertArtifact(artifact('debug', 'coding'));
  repo.upsertArtifact(artifact('brief', 'business'));
  const proposal = proposeLoadouts(repo, repo.listArtifacts());
  expect(JSON.stringify(proposal.content)).toContain('coding');
  repo.close();

  const env = { ...process.env, QM_DB_PATH: dbPath };
  const list = JSON.parse(
    execFileSync('bun', ['src/cli/index.ts', 'proposal', 'list', '--json'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    }),
  );
  expect(list.data.proposals.length).toBe(1);
  const proposed = JSON.parse(
    execFileSync('bun', ['src/cli/index.ts', 'propose', 'loadouts', '--json'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    }),
  );
  expect(proposed.ok).toBe(true);
});
