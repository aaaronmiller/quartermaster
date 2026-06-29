import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Artifact } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';

function artifact(id: string, path: string): Artifact {
  return {
    id,
    type: 'skill',
    name: id,
    path,
    organizationalPath: '.',
    hash: id,
    size: 1,
    metadata: {},
    source: { kind: 'self', path },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: `self:${path}`,
  };
}

function writeProfile(profileDir: string, id: string, targetDir: string): void {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, `${id}.yaml`),
    `id: ${id}
name: ${id}
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

function run(env: NodeJS.ProcessEnv, args: string[]): { ok: boolean; data?: unknown; reason?: string } {
  const out = execFileSync('bun', ['src/cli/index.ts', ...args, '--json'], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

test('loadout CRUD stores distinct harness-independent memberships', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-loadout-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const env = { ...process.env, QM_DB_PATH: dbPath };

  expect(run(env, ['loadout', 'create', 'coding', 'coding-skill']).ok).toBe(true);
  expect(run(env, ['loadout', 'create', 'general', 'general-skill']).ok).toBe(true);
  expect(run(env, ['loadout', 'create', 'business', 'business-skill']).ok).toBe(true);
  expect(run(env, ['loadout', 'add', 'coding', 'debug-skill']).ok).toBe(true);
  expect(run(env, ['loadout', 'remove', 'coding', 'debug-skill']).ok).toBe(true);

  const listed = run(env, ['loadout', 'list']) as {
    data: { loadouts: Array<{ name: string; harnesses: string[]; artifacts: string[] }> };
  };
  expect(listed.data.loadouts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ name: 'coding', harnesses: [], artifacts: ['coding-skill'] }),
      expect.objectContaining({ name: 'general', harnesses: [], artifacts: ['general-skill'] }),
      expect.objectContaining({ name: 'business', harnesses: [], artifacts: ['business-skill'] }),
    ]),
  );
});

test('assigning, switching, and copying loadouts changes active set without touching library', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-loadout-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const profileDir = join(dir, 'profiles');
  const libraryDir = join(dir, 'library');
  const targetDir = join(dir, 'target');
  const otherTargetDir = join(dir, 'other-target');
  mkdirSync(libraryDir, { recursive: true });
  const codingPath = join(libraryDir, 'coding.md');
  const generalPath = join(libraryDir, 'general.md');
  writeFileSync(codingPath, '# coding\n');
  writeFileSync(generalPath, '# general\n');
  writeProfile(profileDir, 'loadout-profile', targetDir);
  writeProfile(profileDir, 'other-profile', otherTargetDir);

  const repo = new Repository({ dbPath });
  repo.upsertArtifact(artifact('coding-skill', codingPath));
  repo.upsertArtifact(artifact('general-skill', generalPath));
  repo.close();

  const env = { ...process.env, QM_DB_PATH: dbPath, QM_PROFILE_DIR: profileDir };
  run(env, ['loadout', 'create', 'coding', 'coding-skill']);
  run(env, ['loadout', 'create', 'general', 'general-skill']);
  expect(run(env, ['loadout', 'assign', 'coding', 'loadout-profile']).ok).toBe(true);

  const codingPlan = run(env, ['deploy', 'loadout-profile']) as {
    data: { plan: { operations: Array<{ artifactId: string }> } };
  };
  expect(codingPlan.data.plan.operations.map((op) => op.artifactId)).toEqual(['coding-skill']);
  run(env, ['deploy', 'loadout-profile', '--yes']);
  expect(existsSync(join(targetDir, 'coding.md'))).toBe(true);
  expect(existsSync(codingPath)).toBe(true);

  run(env, ['loadout', 'assign', 'general', 'loadout-profile']);
  const generalPlan = run(env, ['deploy', 'loadout-profile']) as {
    data: { plan: { operations: Array<{ artifactId: string }> } };
  };
  expect(generalPlan.data.plan.operations.map((op) => op.artifactId)).toEqual(['general-skill']);
  expect(existsSync(codingPath)).toBe(true);

  expect(run(env, ['loadout', 'copy', 'general', 'loadout-profile', 'other-profile']).ok).toBe(true);
  const copiedStatus = run(env, ['loadout', 'status', 'other-profile']) as {
    data: { activeLoadout: string; activeArtifactCount: number; activeArtifacts: string[] };
  };
  expect(copiedStatus.data).toEqual({
    harness: 'other-profile',
    activeLoadout: 'general',
    activeArtifactCount: 1,
    activeArtifacts: ['general-skill'],
  });

  const status = run(env, ['status', 'loadout-profile']) as {
    data: { loadout: { activeLoadout: string; activeArtifactCount: number; activeArtifacts: string[] } };
  };
  expect(status.data.loadout).toEqual({
    harness: 'loadout-profile',
    activeLoadout: 'general',
    activeArtifactCount: 1,
    activeArtifacts: ['general-skill'],
  });
});

// ─── FR-112 / FR-113: pipelines inside loadouts + activation gating ──────────

import { LoadoutManager } from '../../src/core/loadouts/loadouts';
import { PipelineManager } from '../../src/core/pipelines/pipelines';

test('activating a loadout with a pipeline includes the pipeline member skills (FR-112)', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.upsertArtifact(artifact('skill-a', '/tmp/a.md'));
  repo.upsertArtifact(artifact('skill-b', '/tmp/b.md'));

  const pipelines = new PipelineManager(repo);
  pipelines.create({ name: 'review', artifacts: ['skill-a', 'skill-b'], directives: { priority: 5 } });

  const loadouts = new LoadoutManager(repo);
  loadouts.createNamed('coding', [], ['review']);
  loadouts.activate('claude-code', 'coding');

  // Pipeline member skills resolve into the active artifact set.
  expect(loadouts.status('claude-code').activeArtifacts.sort()).toEqual(['skill-a', 'skill-b']);
  // And the active pipeline directives are exposed for guidance injection (FR-121).
  const directives = loadouts.activePipelineDirectives('claude-code');
  expect(directives[0]?.name).toBe('review');
  expect(directives[0]?.directives.priority).toBe(5);
  repo.close();
});

test('loadout activation is blocked until member pipelines validate (FR-113)', () => {
  const repo = new Repository({ dbPath: ':memory:' });
  repo.upsertArtifact(artifact('skill-a', '/tmp/a.md'));

  const pipelines = new PipelineManager(repo);
  // References a skill that does not exist in the catalog → invalid pipeline.
  pipelines.create({ name: 'broken', artifacts: ['skill-a', 'missing-skill'], directives: {} });

  const loadouts = new LoadoutManager(repo);
  loadouts.createNamed('coding', [], ['broken']);

  expect(() => loadouts.activate('claude-code', 'coding')).toThrow(/invalid pipeline/);
  // No loadout is active after a blocked activation.
  expect(loadouts.status('claude-code').activeLoadout).toBeNull();

  // Correcting the pipeline (add the missing artifact) unblocks activation.
  repo.upsertArtifact(artifact('missing-skill', '/tmp/m.md'));
  loadouts.activate('claude-code', 'coding');
  expect(loadouts.status('claude-code').activeLoadout).toBe('coding');
  repo.close();
});
