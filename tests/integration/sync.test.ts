import { describe, expect, test } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitLsRemote } from '../../src/core/sources/git';
import { checkUpstreams } from '../../src/core/sources/sync';
import type { Artifact } from '../../src/core/types';
import { tempRepo } from '../helpers';

/** Create a throwaway local git repo with one commit; return [path, sha]. */
function makeGitRepo(): { path: string; sha: string } {
  const path = mkdtempSync(join(tmpdir(), 'qm-git-'));
  const sh = (cmd: string) => execSync(cmd, { cwd: path, stdio: 'ignore' });
  sh('git init -q');
  sh('git config user.email t@t.io');
  sh('git config user.name test');
  writeFileSync(join(path, 'README.md'), 'hi');
  sh('git add -A');
  sh('git commit -q -m init');
  const sha = execSync('git rev-parse HEAD', { cwd: path }).toString().trim();
  return { path, sha };
}

function artifact(over: Partial<Artifact>): Artifact {
  return {
    id: 'a1',
    type: 'skill',
    name: 'x',
    path: '/lib/x/SKILL.md',
    organizationalPath: 'x',
    hash: 'h0',
    size: 1,
    metadata: {},
    source: { kind: 'local', path: '/lib/x' },
    capabilities: [],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'local',
    ...over,
  };
}

describe('upstream currency (FR-012)', () => {
  test('gitLsRemote resolves a local repo HEAD to its SHA', async () => {
    const { path, sha } = makeGitRepo();
    expect(await gitLsRemote(path, 'HEAD')).toBe(sha);
  });

  test('classifies unchanged / ahead / conflict (read-only, no writes)', async () => {
    const { path, sha } = makeGitRepo();
    const { repo } = tempRepo();

    // unchanged: recorded ref == upstream
    repo.upsertArtifact(
      artifact({ id: 'unchanged', path: '/lib/u', source: { kind: 'git', url: path, ref: 'HEAD' }, metadata: { gitRef: sha } }),
    );
    // ahead: recorded ref differs, not locally modified (importedHash == hash)
    repo.upsertArtifact(
      artifact({ id: 'ahead', path: '/lib/a', source: { kind: 'git', url: path, ref: 'HEAD' }, hash: 'hX', metadata: { gitRef: 'old', importedHash: 'hX' } }),
    );
    // conflict: recorded ref differs AND locally modified (hash != importedHash)
    repo.upsertArtifact(
      artifact({ id: 'conflict', path: '/lib/c', source: { kind: 'git', url: path, ref: 'HEAD' }, hash: 'hNow', metadata: { gitRef: 'old', importedHash: 'hImport' } }),
    );

    const report = await checkUpstreams(repo);
    expect(report.unchanged).toContain('unchanged');
    expect(report.ahead).toContain('ahead');
    expect(report.conflicts.map((c) => c.artifact)).toContain('conflict');
    repo.close();
  });
});
