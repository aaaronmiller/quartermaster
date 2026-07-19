import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeVerdict } from '../../src/core/audit/auditor';
import { rescanIncremental, scanRoots } from '../../src/core/catalog/scanner';
import { loadBuiltInProfiles } from '../../src/core/profiles/profile-registry';
import type { ArtifactType } from '../../src/core/types';
import { copyFixtureLibrary, tempRepo } from '../helpers';

const ALL_TYPES: ArtifactType[] = [
  'skill',
  'plugin',
  'agent',
  'hook',
  'script',
  'mcp-config',
  'slash-command',
  'output-style',
];

describe('scan (FR-001 / FR-002 / FR-005)', () => {
  test('identical skills at different paths have distinct stable identities', async () => {
    const { repo, dir } = tempRepo();
    const root = join(dir, 'library');
    for (const name of ['one', 'two']) {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, 'SKILL.md'), '---\nname: duplicate\n---\nSame bytes.\n');
    }

    const result = await scanRoots([root], repo);
    const artifacts = repo.listArtifacts({ type: 'skill' });
    expect(result.errors).toEqual([]);
    expect(artifacts).toHaveLength(2);
    expect(new Set(artifacts.map((artifact) => artifact.id)).size).toBe(2);
    expect(new Set(artifacts.map((artifact) => artifact.hash)).size).toBe(1);
    repo.close();
  });

  test('content edits and unambiguous package moves preserve artifact identity', async () => {
    const { repo, dir } = tempRepo();
    const root = join(dir, 'library');
    const first = join(root, 'first');
    mkdirSync(first, { recursive: true });
    writeFileSync(join(first, 'SKILL.md'), '---\nname: stable\n---\nVersion one.\n');

    await scanRoots([root], repo);
    const original = repo.listArtifacts()[0]!;
    appendFileSync(join(first, 'SKILL.md'), 'Version two.\n');
    await scanRoots([root], repo);
    expect(repo.listArtifacts()[0]?.id).toBe(original.id);

    const second = join(root, 'second');
    renameSync(first, second);
    await scanRoots([root], repo);
    const moved = repo.listArtifacts()[0]!;
    expect(moved.id).toBe(original.id);
    expect(moved.path).toBe(join(second, 'SKILL.md'));
    repo.close();
  });

  test('a SKILL.md directory is one package whose members affect its hash', async () => {
    const { repo, dir } = tempRepo();
    const root = join(dir, 'library');
    const skill = join(root, 'packaged');
    mkdirSync(join(skill, 'scripts'), { recursive: true });
    mkdirSync(join(skill, 'references'), { recursive: true });
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: packaged\ngrade: A\n---\nUse the script.\n');
    writeFileSync(join(skill, 'scripts', 'run.py'), 'print("one")\n');
    writeFileSync(join(skill, 'references', 'guide.md'), 'Reference.\n');

    await scanRoots([root], repo);
    const artifact = repo.listArtifacts()[0]!;
    expect(repo.listArtifacts()).toHaveLength(1);
    expect(artifact.metadata.packageMemberCount).toBe(3);
    expect(artifact.capabilities.map((capability) => capability.type)).toEqual(['skill']);

    writeFileSync(join(skill, 'scripts', 'run.py'), 'print("two")\n');
    const changed = await scanRoots([root], repo);
    expect(changed.changed).toHaveLength(1);
    expect(changed.changed[0]?.id).toBe(artifact.id);
    expect(changed.changed[0]?.hash).not.toBe(artifact.hash);
    repo.close();
  });

  test('detects all 8 artifact types across nested folders (FR-001)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    const r = await scanRoots([root], repo);

    expect(r.errors).toEqual([]);
    const types = new Set(repo.listArtifacts().map((a) => a.type));
    for (const t of ALL_TYPES) {
      expect(types.has(t)).toBe(true);
    }
    repo.close();
  });

  test('records organizational subfolder path independent of layout (FR-002)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    await scanRoots([root], repo);

    const skill = repo.listArtifacts().find((a) => a.type === 'skill');
    expect(skill?.organizationalPath).toBe('research/deep-research');
    repo.close();
  });

  test('a re-scan of an unchanged library reports no changes (FR-005)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    await scanRoots([root], repo);
    const second = await scanRoots([root], repo);
    expect(second.added.length).toBe(0);
    expect(second.changed.length).toBe(0);
    repo.close();
  });

  test('a full re-scan removes catalog entries no longer present under the scanned root', async () => {
    const { repo, dir } = tempRepo();
    const root = join(dir, 'library');
    const packageDir = join(root, 'removed');
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(join(packageDir, 'SKILL.md'), '---\nname: removed\n---\n');
    await scanRoots([root], repo);
    const artifact = repo.listArtifacts()[0]!;
    rmSync(packageDir, { recursive: true });
    const result = await scanRoots([root], repo);
    expect(result.removed.map((item) => item.id)).toEqual([artifact.id]);
    expect(repo.listArtifacts()).toEqual([]);
    repo.close();
  });

  test('incremental rescan reports exactly the changed artifact (FR-005)', async () => {
    const { repo } = tempRepo();
    const root = copyFixtureLibrary();
    await scanRoots([root], repo);

    appendFileSync(join(root, 'research/deep-research/SKILL.md'), '\nappended\n');
    const r = await rescanIncremental(repo);
    expect(r.changed.length).toBe(1);
    expect(r.removed.length).toBe(0);
    repo.close();
  });

  test('qm new skill scaffolds into a subfolder, scans, and audits as deployable (FR-050)', async () => {
    const { repo, dir } = tempRepo();
    const root = join(dir, 'library');
    execFileSync(
      'bun',
      ['src/cli/index.ts', 'new', 'skill', 'research/my-skill/SKILL.md', '--json'],
      {
        cwd: process.cwd(),
        env: { ...process.env, QM_ROOTS: root, QM_DB_PATH: join(dir, 'catalog.sqlite') },
      },
    );
    await scanRoots([root], repo);
    const skill = repo.listArtifacts().find((artifact) => artifact.name === 'SKILL');
    expect(skill?.organizationalPath).toBe('research/my-skill');
    const custom = loadBuiltInProfiles().find((profile) => profile.id === 'claude-code')!;
    expect(computeVerdict(skill!, custom).verdict).not.toBe('incompatible');
    repo.close();
  });
});
