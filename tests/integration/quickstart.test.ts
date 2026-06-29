import { expect, test } from "bun:test";
import { computeCompatibilityMatrix } from "../../src/core/audit/auditor";
import { loadBuiltInProfiles } from "../../src/core/profiles/profile-registry";
import { scanRoots } from "../../src/core/catalog/scanner";
import { compilePlan } from "../../src/core/deploy/plan";
import { fixtureLibrary, tempRepo } from "../helpers";

test("quickstart catalog, audit, and preview scenario", async () => {
  const { repo } = tempRepo();
  const root = fixtureLibrary();
  const scan = await scanRoots([root], repo);
  expect(scan.added.length).toBeGreaterThanOrEqual(8);
  const profiles = loadBuiltInProfiles();
  const matrix = computeCompatibilityMatrix(repo.listArtifacts(), profiles);
  const verdicts = matrix.flat();
  expect(verdicts.length).toBeGreaterThan(0);
  const plan = compilePlan(
    repo.listArtifacts(),
    verdicts,
    profiles[0]!,
    { libraryRoot: root },
  );
  expect(plan.operations.length).toBeGreaterThan(0);
});

// ─── NFR-051: full CLI quickstart chain (scan → audit → deploy → status → rollback) ──

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('end-to-end CLI quickstart: scan, audit, deploy, status, rollback (NFR-051)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-quickstart-'));
  const libraryDir = join(dir, 'library');
  const profileDir = join(dir, 'profiles');
  const targetDir = join(dir, 'target');
  const dbPath = join(dir, 'catalog.sqlite');
  mkdirSync(libraryDir, { recursive: true });
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(join(libraryDir, 'SKILL.md'), '---\nname: demo\ndescription: demo skill\n---\n# demo\n');
  writeFileSync(
    join(profileDir, 'qsd.yaml'),
    `id: qsd\nname: QSD\nversion: 1\nguidanceFilename: AGENTS.md\nartifactTypes:\n  - type: skill\n    locations: { global: "${targetDir}", project: "${targetDir}" }\n    flat: false\n    configFormat: null\ncapabilities:\n  - type: skill\n    dialects: [agent-md]\ndeployment:\n  method: copy\n  crossDevice: false\n  priorStateBackup: true\n`,
  );

  const env = { ...process.env, QM_DB_PATH: dbPath, QM_PROFILE_DIR: profileDir };
  const qm = (args: string[]) => {
    try {
      return JSON.parse(execFileSync('bun', ['src/cli/index.ts', ...args, '--json'], { cwd: process.cwd(), env, encoding: 'utf8' }));
    } catch (err) {
      return JSON.parse((err as { stdout?: string }).stdout ?? '{}');
    }
  };

  const scan = qm(['scan', libraryDir]);
  expect(scan.ok).toBe(true);
  expect(scan.data.added).toBeGreaterThanOrEqual(1);

  const audit = qm(['audit']);
  expect(audit.ok).toBe(true);
  expect(audit.data.harnesses).toContain('qsd');

  const deploy = qm(['deploy', 'qsd', '--yes']);
  expect(deploy.ok).toBe(true);
  expect(existsSync(join(targetDir, 'SKILL.md'))).toBe(true);

  const status = qm(['status', 'qsd']);
  expect(status.ok).toBe(true);

  // Find the deploy id and roll it back.
  const deployId = deploy.data.record?.id ?? deploy.data.deployments?.[0]?.record?.id;
  expect(typeof deployId).toBe('string');
  const rollback = qm(['rollback', deployId]);
  expect(rollback.ok).toBe(true);
  expect(existsSync(join(targetDir, 'SKILL.md'))).toBe(false);
});
