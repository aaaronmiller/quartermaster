import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from '../../src/storage/repository';
import type { Artifact } from '../../src/core/types';
import { executePlacement } from '../../src/core/deploy/placer';

function artifact(source: string): Artifact {
  return {
    id: 'deployable',
    type: 'skill',
    name: 'Deployable',
    path: source,
    organizationalPath: '.',
    hash: 'hash',
    size: 1,
    metadata: {},
    source: { kind: 'self', path: source },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: `self:${source}`,
  };
}

function writeDeployProfile(profileDir: string, targetDir: string): void {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'rollback-profile.yaml'),
    `id: rollback-profile
name: Rollback Profile
version: 1
guidanceFilename: AGENTS.md
artifactTypes:
  - type: skill
    locations: { global: "${targetDir}", project: "${targetDir}" }
    flat: false
    configFormat: null
capabilities:
  - type: skill
    dialects: [agent-md]
deployment:
  method: copy
  crossDevice: false
  priorStateBackup: true
`,
  );
}

test('rollback restores prior target bytes instead of copying current source', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-rollback-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const profileDir = join(dir, 'profiles');
  const libraryDir = join(dir, 'library');
  const targetDir = join(dir, 'target');
  const source = join(libraryDir, 'SKILL.md');
  const target = join(targetDir, 'SKILL.md');
  mkdirSync(libraryDir, { recursive: true });
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(source, '# library version\n');
  writeFileSync(target, '# prior target version\n');
  writeDeployProfile(profileDir, targetDir);
  const repo = new Repository({ dbPath });
  repo.upsertArtifact(artifact(source));
  repo.close();

  const env = { ...process.env, QM_DB_PATH: dbPath, QM_PROFILE_DIR: profileDir };
  const deployOut = execFileSync('bun', ['src/cli/index.ts', 'deploy', 'rollback-profile', '--yes', '--json'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  const deployed = JSON.parse(deployOut) as { data: { record: { id: string } } };
  expect(readFileSync(target, 'utf8')).toBe('# library version\n');

  writeFileSync(source, '# changed after deploy\n');
  execFileSync('bun', ['src/cli/index.ts', 'rollback', deployed.data.record.id, '--json'], {
    cwd: process.cwd(),
    env,
  });

  expect(readFileSync(target, 'utf8')).toBe('# prior target version\n');
});

test('rollback removes targets that did not exist before deploy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-rollback-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const profileDir = join(dir, 'profiles');
  const libraryDir = join(dir, 'library');
  const targetDir = join(dir, 'target');
  const source = join(libraryDir, 'SKILL.md');
  const target = join(targetDir, 'SKILL.md');
  mkdirSync(libraryDir, { recursive: true });
  writeFileSync(source, '# new target\n');
  writeDeployProfile(profileDir, targetDir);
  const repo = new Repository({ dbPath });
  repo.upsertArtifact(artifact(source));
  repo.close();

  const env = { ...process.env, QM_DB_PATH: dbPath, QM_PROFILE_DIR: profileDir };
  const deployOut = execFileSync('bun', ['src/cli/index.ts', 'deploy', 'rollback-profile', '--yes', '--json'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  const deployed = JSON.parse(deployOut) as { data: { record: { id: string } } };
  expect(existsSync(target)).toBe(true);

  execFileSync('bun', ['src/cli/index.ts', 'rollback', deployed.data.record.id, '--json'], {
    cwd: process.cwd(),
    env,
  });
  expect(existsSync(target)).toBe(false);
});

test('failed placement rolls back earlier successful placements', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-failed-deploy-'));
  const source = join(dir, 'source.md');
  const target = join(dir, 'target/source.md');
  writeFileSync(source, '# source\n');

  const result = await executePlacement({
    harness: 'test',
    operations: [
      { sourcePath: source, targetPath: target, method: 'copy' },
      { sourcePath: join(dir, 'missing.md'), targetPath: join(dir, 'target/missing.md'), method: 'copy' },
    ],
    excluded: [],
  });

  expect(result.operations.map((op) => op.status)).toEqual(['placed', 'failed']);
  expect(existsSync(target)).toBe(false);
});
