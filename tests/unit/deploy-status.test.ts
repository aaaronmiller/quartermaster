import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getHarnessStatus } from '../../src/core/deploy/status';
import type { HarnessProfile } from '../../src/core/types';
import { tempRepo } from '../helpers';

function makeProfile(skillDir: string): HarnessProfile {
  return {
    id: 'test-harness',
    name: 'Test Harness',
    version: 1,
    guidanceFilename: 'AGENTS.md',
    artifactTypes: [
      {
        type: 'skill',
        locations: { global: skillDir, project: '.test/skills' },
        flat: false,
        configFormat: null,
      },
    ],
    capabilities: [],
    deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
  };
}

function record(id: string, harness: string, timestamp: string, operations: Array<{ sourcePath: string; targetPath: string; method: 'link' | 'copy' }>) {
  return {
    id,
    timestamp,
    harness,
    plan: { harness, operations, excluded: [] },
    status: 'applied' as const,
  };
}

describe('getHarnessStatus unaccounted-file classification', () => {
  test('deployed link whose library source was removed is drift, not orphaned (QM-010)', async () => {
    const { repo } = tempRepo();
    const root = mkdtempSync(join(tmpdir(), 'qm-status-'));
    const skillDir = join(root, 'skills');
    const libDir = join(root, 'library');
    mkdirSync(join(skillDir, 'old-skill'), { recursive: true });
    mkdirSync(join(skillDir, 'keep-skill'), { recursive: true });
    mkdirSync(join(libDir, 'create_new_spec_design_project-skill'), { recursive: true });
    mkdirSync(libDir, { recursive: true });

    // Library sources.
    const oldSource = join(libDir, 'create_new_spec_design_project-skill', 'SKILL.md');
    const keepSource = join(libDir, 'keep-skill.md');
    writeFileSync(oldSource, 'old');
    writeFileSync(keepSource, 'keep');

    // Deployed state: a link later left dangling when its library source was
    // moved away, plus a still-valid link the latest plan covers.
    const danglingTarget = join(skillDir, 'old-skill', 'SKILL.md');
    const keepTarget = join(skillDir, 'keep-skill', 'SKILL.md');
    symlinkSync(oldSource, danglingTarget);
    symlinkSync(keepSource, keepTarget);

    // Older record deployed both; newer record (artifact dropped from the
    // catalog) only covers keep-skill. Then the old library source is removed.
    repo.recordDeployment(record('r1', 'test-harness', '2026-08-01T00:00:00Z', [
      { sourcePath: oldSource, targetPath: danglingTarget, method: 'link' },
      { sourcePath: keepSource, targetPath: keepTarget, method: 'link' },
    ]));
    repo.recordDeployment(record('r2', 'test-harness', '2026-08-02T00:00:00Z', [
      { sourcePath: keepSource, targetPath: keepTarget, method: 'link' },
    ]));
    unlinkSync(oldSource);

    const status = await getHarnessStatus('test-harness', repo, makeProfile(skillDir));

    expect(status.drift).toContain(danglingTarget);
    expect(status.orphaned).not.toContain(danglingTarget);
    expect(status.stale).not.toContain(danglingTarget);
    // The covered artifact is still reported deployed and in sync.
    const keep = status.deployed.find((d) => d.targetPath === keepTarget);
    expect(keep?.inSync).toBe(true);
    repo.close();
  });

  test('files a prior deployment placed are stale, never-deployed files are orphaned (QM-011)', async () => {
    const { repo } = tempRepo();
    const root = mkdtempSync(join(tmpdir(), 'qm-status-'));
    const skillDir = join(root, 'skills');
    const libDir = join(root, 'library');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });

    const staleSource = join(libDir, 'dropped-skill.md');
    const staleTarget = join(skillDir, 'dropped-skill.md');
    const orphanTarget = join(skillDir, 'stranger.md');
    writeFileSync(staleSource, 'dropped');
    // Managed residue: qm deployed it (copy) in an earlier record; the latest
    // plan no longer covers it.
    writeFileSync(staleTarget, 'dropped');
    // Foreign residue: no recorded deployment ever placed it.
    writeFileSync(orphanTarget, 'stranger');

    repo.recordDeployment(record('r1', 'test-harness', '2026-08-01T00:00:00Z', [
      { sourcePath: staleSource, targetPath: staleTarget, method: 'copy' },
    ]));
    repo.recordDeployment(record('r2', 'test-harness', '2026-08-02T00:00:00Z', []));

    const status = await getHarnessStatus('test-harness', repo, makeProfile(skillDir));

    expect(status.stale).toContain(staleTarget);
    expect(status.orphaned).not.toContain(staleTarget);
    expect(status.orphaned).toContain(orphanTarget);
    expect(status.drift).not.toContain(staleTarget);
    repo.close();
  });

  test('a managed link whose target still resolves is stale, not drift', async () => {
    const { repo } = tempRepo();
    const root = mkdtempSync(join(tmpdir(), 'qm-status-'));
    const skillDir = join(root, 'skills');
    const libDir = join(root, 'library');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(libDir, { recursive: true });

    const source = join(libDir, 'renamed-skill.md');
    const target = join(skillDir, 'renamed-skill.md');
    writeFileSync(source, 'intact');
    symlinkSync(source, target);

    repo.recordDeployment(record('r1', 'test-harness', '2026-08-01T00:00:00Z', [
      { sourcePath: source, targetPath: target, method: 'link' },
    ]));
    repo.recordDeployment(record('r2', 'test-harness', '2026-08-02T00:00:00Z', []));

    const status = await getHarnessStatus('test-harness', repo, makeProfile(skillDir));

    expect(status.stale).toContain(target);
    expect(status.drift).not.toContain(target);
    expect(status.orphaned).not.toContain(target);
    repo.close();
  });
});
