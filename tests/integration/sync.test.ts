import { describe, expect, test } from 'bun:test';
import { execFileSync, execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gitLsRemote } from '../../src/core/sources/git';
import { ImportManager } from '../../src/core/sources/importers';
import { checkUpstreams, syncUpstreams } from '../../src/core/sources/sync';
import type { Artifact, ArtifactSource } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';
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

function makeArtifactGitRepo(label = 'Git'): { path: string; sha: string; branch: string } {
  const path = mkdtempSync(join(tmpdir(), 'qm-artifact-git-'));
  const sh = (cmd: string) => execSync(cmd, { cwd: path, stdio: 'ignore' });
  sh('git init -q');
  sh('git config user.email t@t.io');
  sh('git config user.name test');
  mkdirSync(join(path, 'skills/research'), { recursive: true });
  writeFileSync(
    join(path, 'skills/research/SKILL.md'),
    `---\nname: ${label} Skill\ndescription: Imported from git\nversion: 1.0.0\n---\n# ${label} Skill\n`,
  );
  mkdirSync(join(path, 'plugins/review'), { recursive: true });
  writeFileSync(
    join(path, 'plugins/review/plugin.yaml'),
    `name: ${label} Review Plugin\ndescription: Subdir plugin\nhooks:\n  - preflight\n`,
  );
  sh('git add -A');
  sh('git commit -q -m init');
  const sha = execSync('git rev-parse HEAD', { cwd: path }).toString().trim();
  const branch = execSync('git branch --show-current', { cwd: path }).toString().trim();
  return { path, sha, branch };
}

function commitSkillChange(repoPath: string, label: string): string {
  writeFileSync(
    join(repoPath, 'skills/research/SKILL.md'),
    `---\nname: ${label} Skill\ndescription: Updated upstream\nversion: 2.0.0\n---\n# ${label} Skill v2\n`,
  );
  execSync('git add -A', { cwd: repoPath, stdio: 'ignore' });
  execSync('git commit -q -m update-skill', { cwd: repoPath, stdio: 'ignore' });
  return execSync('git rev-parse HEAD', { cwd: repoPath }).toString().trim();
}

function makeSkillDir(prefix: string, name: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(
    join(dir, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${name} fixture\nversion: 1.0.0\n---\n# ${name}\n`,
  );
  return dir;
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

describe('source import and provenance (FR-010/011)', () => {
  test('imported git artifacts record source, revision, provenance, and imported hash', async () => {
    const git = makeArtifactGitRepo();
    const { repo, dir } = tempRepo();
    const manager = new ImportManager(repo);

    const source: ArtifactSource = { kind: 'git', url: git.path, ref: git.branch };
    const result = await manager.importFromSource({ source, targetDir: join(dir, 'imports') });

    expect(result.added.length).toBeGreaterThan(0);
    const imported = repo.listArtifacts().find((a) => a.name === 'Git Skill');
    expect(imported).toBeTruthy();
    expect(imported?.source.kind).toBe('git');
    expect(imported?.source.importedRevision).toBe(git.sha);
    expect(imported?.metadata.importedHash).toBe(imported?.hash);
    expect(imported?.metadata.gitRef).toBe(git.sha);
    expect(imported?.provenance).toContain(`git:${git.path}@${git.branch}`);
    repo.close();
  });

  test('git subdirectory import catalogs only that subdir', async () => {
    const git = makeArtifactGitRepo();
    const { repo, dir } = tempRepo();
    const manager = new ImportManager(repo);

    await manager.importFromSource({
      source: { kind: 'git_subdir', url: git.path, ref: git.branch, subdir: 'plugins' },
      targetDir: join(dir, 'imports'),
    });

    const artifacts = repo.listArtifacts();
    expect(artifacts.map((a) => a.type)).toEqual(['plugin']);
    expect(artifacts[0]?.source.kind).toBe('git_subdir');
    repo.close();
  });

  test('marketplace and local imports produce correct source records', async () => {
    const { repo, dir } = tempRepo();
    const manager = new ImportManager(repo);
    const marketplaceFixture = makeSkillDir('qm-marketplace-', 'Marketplace Skill');
    const localFixture = makeSkillDir('qm-local-', 'Local Skill');

    await manager.importFromSource({
      source: { kind: 'marketplace', url: `file://${marketplaceFixture}` },
      targetDir: join(dir, 'marketplace'),
    });
    await manager.importFromSource({
      source: { kind: 'local', path: localFixture },
      targetDir: join(dir, 'local'),
    });

    const sources = repo.listArtifacts().map((a) => a.source.kind);
    expect(sources).toContain('marketplace');
    expect(sources).toContain('local');
    repo.close();
  });

  test('qm import imports all four source forms via CLI', () => {
    const git = makeArtifactGitRepo();
    const subdirGit = makeArtifactGitRepo('Subdir');
    const { repo, dir } = tempRepo();
    const dbPath = join(dir, 'catalog.sqlite');
    repo.close();
    const env = { ...process.env, QM_DB_PATH: dbPath };
    const runImport = (args: string[]) => {
      const out = execFileSync('bun', ['src/cli/index.ts', 'import', ...args, '--json'], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
      });
      return JSON.parse(out) as { ok: boolean; data?: { added: number }; reason?: string };
    };
    const runSyncCheck = () => {
      const out = execFileSync('bun', ['src/cli/index.ts', 'sync', '--check', '--json'], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
      });
      return JSON.parse(out) as {
        ok: boolean;
        data?: { unchanged: string[]; ahead: string[]; conflicts: unknown[]; errors: unknown[] };
      };
    };

    const gitOut = runImport([
      git.path,
      `--target=${join(dir, 'git')}`,
      '--kind=git',
      `--ref=${git.branch}`,
    ]);
    const subdirOut = runImport([
      subdirGit.path,
      `--target=${join(dir, 'git-subdir')}`,
      '--kind=git_subdir',
      `--ref=${subdirGit.branch}`,
      '--subdir=plugins',
    ]);
    const marketOut = runImport([
      `file://${makeSkillDir('qm-cli-market-', 'CLI Marketplace Skill')}`,
      `--target=${join(dir, 'market')}`,
    ]);
    const localOut = runImport([
      makeSkillDir('qm-cli-local-', 'CLI Local Skill'),
      `--target=${join(dir, 'local')}`,
    ]);

    expect(gitOut.ok).toBe(true);
    expect(subdirOut.ok).toBe(true);
    expect(marketOut.ok).toBe(true);
    expect(localOut.ok).toBe(true);
    expect(gitOut.data?.added).toBeGreaterThan(0);
    expect(subdirOut.data?.added).toBe(1);

    const checkRepo = new Repository({ dbPath });
    const kinds = checkRepo.listArtifacts().map((a) => a.source.kind);
    expect(kinds).toContain('git');
    expect(kinds).toContain('git_subdir');
    expect(kinds).toContain('marketplace');
    expect(kinds).toContain('local');
    checkRepo.close();

    const syncOut = runSyncCheck();
    expect(syncOut.ok).toBe(true);
    expect(syncOut.data?.errors).toEqual([]);
    expect((syncOut.data?.unchanged.length ?? 0) + (syncOut.data?.ahead.length ?? 0)).toBeGreaterThan(0);
  });
});

describe('upstream updates and overwrite protection (FR-013)', () => {
  test('sync updates clean artifacts when upstream advances', async () => {
    const git = makeArtifactGitRepo('Clean');
    const { repo, dir } = tempRepo();
    const manager = new ImportManager(repo);
    await manager.importFromSource({
      source: { kind: 'git', url: git.path, ref: git.branch },
      targetDir: join(dir, 'library'),
    });
    const before = repo.listArtifacts().find((a) => a.name === 'Clean Skill');
    expect(before).toBeTruthy();

    const nextSha = commitSkillChange(git.path, 'Clean');
    const report = await syncUpstreams(repo, manager);
    const after = repo.getArtifactByPath(before!.path);

    expect(report.updated).toContain(before!.id);
    expect(after?.metadata.gitRef).toBe(nextSha);
    expect(after?.metadata.importedHash).toBe(after?.hash);
    expect(execSync(`cat ${before!.path}`).toString()).toContain('Clean Skill v2');
    repo.close();
  });

  test('sync never silently overwrites locally modified artifacts', async () => {
    const git = makeArtifactGitRepo('Conflict');
    const { repo, dir } = tempRepo();
    const manager = new ImportManager(repo);
    await manager.importFromSource({
      source: { kind: 'git', url: git.path, ref: git.branch },
      targetDir: join(dir, 'library'),
    });
    const before = repo.listArtifacts().find((a) => a.name === 'Conflict Skill');
    expect(before).toBeTruthy();

    writeFileSync(before!.path, '# local edit\n');
    const changedLocal: Artifact = {
      ...before!,
      hash: 'local-edit-hash',
      metadata: { ...before!.metadata, importedHash: before!.hash },
    };
    repo.upsertArtifact(changedLocal);
    const nextSha = commitSkillChange(git.path, 'Conflict');

    const report = await syncUpstreams(repo, manager);
    const afterContent = execSync(`cat ${before!.path}`).toString();

    expect(report.conflicts).toContainEqual({
      artifact: before!.id,
      localRevision: git.sha,
      upstreamRevision: nextSha,
    });
    expect(report.updated).not.toContain(before!.id);
    expect(afterContent).toBe('# local edit\n');
    repo.close();
  });

  test('qm sync defaults to conflict and --confirm overwrites local modifications', async () => {
    const git = makeArtifactGitRepo('CliConflict');
    const { repo, dir } = tempRepo();
    const manager = new ImportManager(repo);
    await manager.importFromSource({
      source: { kind: 'git', url: git.path, ref: git.branch },
      targetDir: join(dir, 'library'),
    });
    const before = repo.listArtifacts().find((a) => a.name === 'CliConflict Skill');
    expect(before).toBeTruthy();

    writeFileSync(before!.path, '# cli local edit\n');
    repo.upsertArtifact({
      ...before!,
      hash: 'cli-local-edit-hash',
      metadata: { ...before!.metadata, importedHash: before!.hash },
    });
    commitSkillChange(git.path, 'CliConflict');
    repo.close();

    const env = { ...process.env, QM_DB_PATH: join(dir, 'catalog.sqlite') };
    const runSync = (extra: string[]) => {
      const out = execFileSync('bun', ['src/cli/index.ts', 'sync', ...extra, '--json'], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
      });
      return JSON.parse(out) as {
        ok: boolean;
        data?: { updated: string[]; conflicts: Array<{ artifact: string }> };
      };
    };

    const defaultOut = runSync([]);
    expect(defaultOut.ok).toBe(true);
    expect(defaultOut.data?.conflicts.map((c) => c.artifact)).toContain(before!.id);
    expect(readFileSync(before!.path, 'utf8')).toBe('# cli local edit\n');

    const confirmOut = runSync(['--confirm']);
    expect(confirmOut.ok).toBe(true);
    expect(confirmOut.data?.updated).toContain(before!.id);
    expect(readFileSync(before!.path, 'utf8')).toContain('CliConflict Skill v2');
  });
});

describe('pinning upstream revisions (FR-014)', () => {
  test('qm pin skips sync until qm unpin allows advancement', async () => {
    const git = makeArtifactGitRepo('Pinned');
    const { repo, dir } = tempRepo();
    const manager = new ImportManager(repo);
    await manager.importFromSource({
      source: { kind: 'git', url: git.path, ref: git.branch },
      targetDir: join(dir, 'library'),
    });
    const before = repo.listArtifacts().find((a) => a.name === 'Pinned Skill');
    expect(before).toBeTruthy();
    repo.close();

    const env = { ...process.env, QM_DB_PATH: join(dir, 'catalog.sqlite') };
    const run = (args: string[]) => {
      const out = execFileSync('bun', ['src/cli/index.ts', ...args, '--json'], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
      });
      return JSON.parse(out) as {
        ok: boolean;
        data?: { pinnedRevision?: string; pinned?: string[]; updated?: string[] };
      };
    };

    const pinOut = run(['pin', before!.id, git.sha]);
    expect(pinOut.ok).toBe(true);
    expect(pinOut.data?.pinnedRevision).toBe(git.sha);

    commitSkillChange(git.path, 'Pinned');
    const pinnedSync = run(['sync']);
    expect(pinnedSync.ok).toBe(true);
    expect(pinnedSync.data?.pinned).toContain(before!.id);
    expect(readFileSync(before!.path, 'utf8')).toContain('Pinned Skill\n');

    const unpinOut = run(['unpin', before!.id]);
    expect(unpinOut.ok).toBe(true);
    const advancedSync = run(['sync']);
    expect(advancedSync.ok).toBe(true);
    expect(advancedSync.data?.updated).toContain(before!.id);
    expect(readFileSync(before!.path, 'utf8')).toContain('Pinned Skill v2');
  });
});
