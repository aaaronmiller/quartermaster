// ─────────────────────────────────────────────────────────────
// Performance NFRs (NFR-001 scan, NFR-002 audit, NFR-003 search).
// Thresholds are generous CI-safe ceilings; the point is to catch
// pathological regressions, not microbenchmark. Per-test harness
// timeouts are raised so the NFR assertion (not bun) is the gate.
// ─────────────────────────────────────────────────────────────

import { beforeAll, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rescanIncremental, scanRoots } from '../../src/core/catalog/scanner';
import { computeCompatibilityMatrix } from '../../src/core/audit/auditor';
import { searchCatalog } from '../../src/core/catalog/search';
import { loadBuiltInProfiles } from '../../src/core/profiles/profile-registry';
import { Repository } from '../../src/storage/repository';
import { generatePerfLibrary } from '../fixtures/perf/generate';

const COUNT = 1000;

// Built once and shared across the audit/search timing tests.
let sharedRoot = '';
let sharedRepo: Repository;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-perf-shared-'));
  sharedRoot = generatePerfLibrary(join(dir, 'library'), COUNT);
  sharedRepo = new Repository({ dbPath: join(dir, 'catalog.sqlite') });
  await scanRoots([sharedRoot], sharedRepo);
}, 60_000);

test('perf fixture builds a 1000-artifact catalog (T270)', () => {
  expect(sharedRepo.listArtifacts().length).toBe(COUNT);
});

test(
  'full scan < 10s and incremental rescan < 2s on 1000 artifacts (NFR-001)',
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'qm-perf-scan-'));
    const repo = new Repository({ dbPath: join(dir, 'catalog.sqlite') });
    const t0 = Bun.nanoseconds();
    const scan = await scanRoots([sharedRoot], repo);
    const fullMs = (Bun.nanoseconds() - t0) / 1e6;
    expect(scan.added.length).toBe(COUNT);
    expect(fullMs).toBeLessThan(10_000);

    const t1 = Bun.nanoseconds();
    const rescan = await rescanIncremental(repo);
    const incMs = (Bun.nanoseconds() - t1) / 1e6;
    expect(rescan.added.length).toBe(0);
    expect(incMs).toBeLessThan(2_000);
    repo.close();
  },
  60_000,
);

test(
  'audit 1000×10 compatibility matrix < 5s (NFR-002)',
  () => {
    const artifacts = sharedRepo.listArtifacts();
    const builtins = loadBuiltInProfiles();
    const profiles = Array.from({ length: 10 }, (_, i) => ({ ...builtins[i % builtins.length]!, id: `h${i}` }));
    const t0 = Bun.nanoseconds();
    const matrix = computeCompatibilityMatrix(artifacts, profiles);
    const ms = (Bun.nanoseconds() - t0) / 1e6;
    expect(matrix.length).toBe(COUNT);
    expect(matrix[0]!.length).toBe(10);
    expect(ms).toBeLessThan(5_000);
  },
  30_000,
);

test(
  'search < 1s on 1000 artifacts (NFR-003)',
  () => {
    const t0 = Bun.nanoseconds();
    const results = searchCatalog(sharedRepo, { text: 'skill-500' });
    const ms = (Bun.nanoseconds() - t0) / 1e6;
    expect(results.length).toBeGreaterThan(0);
    expect(ms).toBeLessThan(1_000);
  },
  30_000,
);
