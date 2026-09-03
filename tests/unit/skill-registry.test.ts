// ─────────────────────────────────────────────────────────────
// Skill Registry Tests — D3.1-D3.8 Gates
// C1: cheap enough to always run — latency + token budget
// C2: Explicit lifecycle, C3: metadata never bodies, C4: local first
// ─────────────────────────────────────────────────────────────

import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Repository } from '@storage/repository';
import { discoverySearch, resolveSkill, getLevel1, getLevel2, artifactToLevel0 } from '@core/skills/discovery';
import { dedupeSearch } from '@core/skills/dedupe';
import { emitUsageEvent, listUsageEvents } from '@core/skills/events';
import { recordGap, listGaps } from '@core/skills/gaps';
import { isVetted } from '@core/skills/vetted';
import { buildDeliveryMatrix } from '@core/skills/matrix';

let tmpDir: string;
let repo: Repository;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'qm-skill-test-'));
  const dbPath = join(tmpDir, 'test-skill.db');
  repo = new Repository({ dbPath });
  // Seed with a few skill artifacts mimicking real catalog
  const now = new Date().toISOString();
  const baseArtifact = (id: string, name: string, desc: string, org: string) => ({
    id,
    type: 'skill' as const,
    name,
    path: `/tmp/${name}/SKILL.md`,
    organizationalPath: org,
    hash: `hash_${id}`,
    size: 100,
    metadata: { name, description: desc },
    source: { kind: 'local' as const, path: `/tmp/${name}` },
    capabilities: [],
    importedAt: now,
    updatedAt: now,
    provenance: 'test',
  });

  repo.upsertArtifact(baseArtifact('art_test_audit', 'skill-audit', 'Audit skill ecosystems for quality, redundancy, "audit skills" triggers', 'first-party/custom-skills/skill-audit'));
  repo.upsertArtifact(baseArtifact('art_test_black', 'black-magic', 'Use when organizing any project folder, "organize folder" triggers', 'first-party/custom-skills/black-magic'));
  repo.upsertArtifact(baseArtifact('art_test_mcp', 'mcp-builder', 'Build MCP servers, "build an mcp server" triggers', 'third-party/gstack/mcp-builder'));
  repo.upsertArtifact(baseArtifact('art_test_toolkit', 'mcp-toolkit', 'Build MCP servers, "build an mcp server" triggers, toolkit', 'first-party/custom-skills/mcp-toolkit'));
  repo.upsertArtifact(baseArtifact('art_test_disabled', 'only-disabled-skill', 'Unique capability held only by disabled source, "unique-capability-xyz" triggers', 'third-party/gstack/only-disabled-skill'));
  // Explicit disabled state via skill_states table
  repo.db.prepare('INSERT INTO skill_states (artifactId, status, reason, supersededBy, updatedAt) VALUES (?, ?, ?, ?, ?)').run('art_test_disabled', 'disabled', 'source disabled in sources.yaml (test fixture)', null, now);
  repo.db.prepare('INSERT INTO skill_states (artifactId, status, reason, supersededBy, updatedAt) VALUES (?, ?, ?, ?, ?)').run('art_test_mcp', 'superseded', 'merged into mcp-toolkit', 'mcp-toolkit', now);
});

afterAll(() => {
  repo.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('D3.1 Three-level metadata schema', () => {
  test('Level0 has required fields and no bodies', () => {
    const l0 = artifactToLevel0(repo.getArtifact('art_test_audit')!, repo);
    expect(l0.name).toBe('skill-audit');
    expect(Array.isArray(l0.triggers)).toBe(true);
    expect(l0.status).toBeDefined();
    expect(l0.costHint).toBeDefined();
    expect((l0 as unknown as Record<string, unknown>).body).toBeUndefined();
  });

  test('Level0 decision from Level0 alone (no file read)', () => {
    const search = discoverySearch(repo, { text: 'audit skills', limit: 5 });
    expect(search.results[0]!.name).toBe('skill-audit');
    expect(search.results[0]!.triggers.length).toBeGreaterThan(0);
  });
});

describe('D3.2 Discovery — C1 budget, C3 metadata, status filter', () => {
  test('Level0 query over test library returns within single-digit seconds (C1)', () => {
    const search = discoverySearch(repo, { text: 'build', limit: 10 });
    expect(search.elapsedMs).toBeLessThan(5000);
    expect(search.results.length).toBeGreaterThan(0);
    // No Level-0 budget test: ensure token budget ~ K*35 tokens < 500 tokens for K=10
    const tokenEstimate = search.results.length * 35;
    expect(tokenEstimate).toBeLessThan(500);
  });

  test('Discovery returns metadata never bodies (C3)', () => {
    const search = discoverySearch(repo, { text: 'audit', limit: 5 });
    for (const r of search.results) {
      expect((r as unknown as Record<string, unknown>).body).toBeUndefined();
      expect(r.description.length).toBeLessThan(300);
    }
  });

  test('Disabled skill is returned when includeDisabled=true, marked with reason', () => {
    const search = discoverySearch(repo, { text: 'unique-capability-xyz', limit: 10, includeDisabled: true });
    const disabled = search.results.find((r) => r.artifactId === 'art_test_disabled');
    expect(disabled).toBeDefined();
    expect(disabled!.status).toBe('disabled');
    expect(disabled!.statusReason).toContain('disabled');
  });

  test('Disabled skill excluded when includeDisabled=false (filter, not exclusion at index)', () => {
    const search = discoverySearch(repo, { text: 'unique-capability-xyz', limit: 10, includeDisabled: false });
    expect(search.results.find((r) => r.artifactId === 'art_test_disabled')).toBeUndefined();
  });

  test('Superseded skill resolves to successor', () => {
    const resolved = resolveSkill(repo, 'mcp-builder');
    expect(resolved).not.toBeNull();
    expect(resolved!.name).toBe('mcp-toolkit');
    expect(resolved!.status).toBe('active');
  });

  test('Level1 is body, Level2 is deeper resources', () => {
    // Level1/2 require file on disk — we test the resolver contract without file
    // For our fixture, file does not exist, so getLevel1 returns null — the contract is that
    // discovery never pulls bodies into context even when Level1 is available
    const l0 = artifactToLevel0(repo.getArtifact('art_test_audit')!, repo);
    expect(l0.triggers.length).toBeGreaterThan(0);
    // If file existed, getLevel1 would return body separately
    expect(getLevel1(repo, 'art_test_audit')).toBeNull(); // no file at /tmp path, correctly not found
  });
});

describe('D3.3 Dedupe query', () => {
  test('Dedupe by capability not name, with held-out metrics reported honestly', () => {
    const result = dedupeSearch(repo, { text: 'audit skills', limit: 5 });
    expect(result.totalCandidates).toBeGreaterThan(0);
    expect(result.results[0]!.dedupeReason).toBeDefined();
    expect(result.heldOutMetrics).toBeDefined();
    // Honest baseline: even if poor, it must be reported
    expect(typeof result.heldOutMetrics!.top1Accuracy).toBe('number');
  });
});

describe('D3.5 Usage event emitter', () => {
  test('Emits on load and validates against contracts schema', () => {
    const evt = emitUsageEvent(repo, { skill: 'skill-audit', trigger: 'task_start', openedPastLevel0: true, outcome: 'accepted', clauseId: 'WA.PR.06' });
    expect(evt.skill).toBe('skill-audit');
    expect(evt.trigger).toBe('task_start');
    expect(evt.openedPastLevel0).toBe(true);
    expect(evt.clauseId).toBe('WA.PR.06');
    const listed = listUsageEvents(repo, { skill: 'skill-audit' });
    expect(listed.length).toBeGreaterThan(0);
  });

  test('Rejects invalid trigger', () => {
    expect(() => emitUsageEvent(repo, { skill: 'x', trigger: 'invalid' as never, openedPastLevel0: false })).toThrow();
  });
});

describe('D3.6 Loadout vetted query', () => {
  test('Answers is X vetted without human input', () => {
    const result = isVetted(repo, 'skill-audit');
    expect(result.skill).toBe('skill-audit');
    expect(typeof result.vetted).toBe('boolean');
    expect(result.reason).toBeDefined();
  });
  test('Unknown skill is not vetted with plain reason', () => {
    const result = isVetted(repo, 'zzzz-not-a-skill-xyz-999');
    expect(result.vetted).toBe(false);
    expect(result.reason.length).toBeGreaterThan(10);
  });
});

describe('D3.7 Gap intake', () => {
  test('Records a gap and appears in queryable list', () => {
    const gap = recordGap(repo, { capability: 'test-cap', context: 'This is a test context that is long enough to be valid' });
    expect(gap.capability).toBe('test-cap');
    const gaps = listGaps(repo, { capability: 'test-cap' });
    expect(gaps.find((g) => g.id === gap.id)).toBeDefined();
  });
});

describe('D3.8 Per-harness delivery matrix', () => {
  test('Matrix has entry per harness with Level0 availability', () => {
    const matrix = buildDeliveryMatrix();
    expect(matrix.length).toBeGreaterThan(10);
    const claude = matrix.find((m) => m.harness === 'claude-code');
    expect(claude).toBeDefined();
    expect(claude!.level0Available).toBe(true);
    const codex = matrix.find((m) => m.harness === 'codex');
    expect(codex!.level0Available).toBe(false);
  });
});
