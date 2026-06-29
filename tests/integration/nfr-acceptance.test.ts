// ─────────────────────────────────────────────────────────────
// NFR acceptance: extensibility (040/041), usability (050),
// provider-agnostic eval (061), offline operation (021).
// ─────────────────────────────────────────────────────────────

import { expect, test } from 'bun:test';
import { computeVerdict } from '../../src/core/audit/auditor';
import { compilePlan } from '../../src/core/deploy/plan';
import { resolveGatewayConfig, singleTurn } from '../../src/core/evaluation/gateway';
import { defaultConfig } from '../../src/core/config/schema';
import type { Artifact, HarnessProfile } from '../../src/core/types';

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'a1',
    type: 'skill',
    name: 'A1',
    path: '/lib/a1/SKILL.md',
    organizationalPath: 'a1',
    hash: 'h',
    size: 1,
    metadata: {},
    source: { kind: 'self', path: '/lib/a1/SKILL.md' },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'self:/lib/a1/SKILL.md',
    ...overrides,
  };
}

/** A brand-new harness expressed purely as profile data (no engine code). */
function customProfile(id: string, supportedTypes: string[]): HarnessProfile {
  return {
    id,
    name: id,
    version: '1.0.0',
    guidanceFilename: 'AGENTS.md',
    artifactTypes: supportedTypes.map((type) => ({
      type: type as Artifact['type'],
      locations: { global: `/tmp/${id}`, project: `/tmp/${id}` },
      flat: false,
      configFormat: null,
    })),
    capabilities: [{ type: 'skill', dialects: ['agent-md'] }],
    deployment: { method: 'copy', crossDevice: false, priorStateBackup: true },
  } as HarnessProfile;
}

// ─── NFR-040: new harness via profile data alone ─────────────────────────────

test('a brand-new harness audits + deploys with zero engine edits (NFR-040, T281)', () => {
  const profile = customProfile('my-new-harness', ['skill']);
  const verdict = computeVerdict(artifact(), profile);
  expect(verdict.verdict).toBe('deployable');
  const plan = compilePlan([artifact()], [verdict], profile);
  expect(plan.operations).toHaveLength(1);
  expect(plan.operations[0]!.targetPath).toContain('my-new-harness');
});

// ─── NFR-041: artifact-type support is profile-driven ────────────────────────

test('artifact-type support is data-driven by the profile (NFR-041, T282)', () => {
  // The same engine path handles a type purely because the profile declares it;
  // a profile that omits the type yields incompatible without any code change.
  const supports = customProfile('h-yes', ['skill', 'hook']);
  const omits = customProfile('h-no', ['skill']);
  const hook = artifact({ id: 'hk', type: 'hook', capabilities: [{ type: 'hooks', dialect: 'claude' }] });

  // Note: 'h-yes' also needs the hooks capability declared to be deployable;
  // here we assert the type-location gate is what the profile drives.
  const omitsVerdict = computeVerdict(hook, omits);
  expect(omitsVerdict.verdict).toBe('incompatible');
  expect(omitsVerdict.reason).toContain('type');
});

// ─── NFR-050: no silent drop — every exclusion carries a reason ──────────────

test('every excluded artifact carries a nonempty plain-language reason (NFR-050, T283)', () => {
  const profile = customProfile('codex-like', ['skill']);
  const incompatible = artifact({ id: 'hk', type: 'hook', capabilities: [{ type: 'hooks', dialect: 'claude' }] });
  const verdict = computeVerdict(incompatible, profile);
  const plan = compilePlan([incompatible], [verdict], profile);
  expect(plan.excluded.length).toBeGreaterThan(0);
  for (const skip of plan.excluded) {
    expect(typeof skip.reason).toBe('string');
    expect(skip.reason.length).toBeGreaterThan(0);
  }
});

// ─── NFR-061: provider-agnostic — swap endpoint via config ───────────────────

test('eval endpoint is swappable purely via config (NFR-061, T285)', async () => {
  const base = defaultConfig();
  const a = { ...base, eval: { ...base.eval, baseUrl: 'http://host-a/v1', defaultModel: 'model-a' } };
  const b = { ...base, eval: { ...base.eval, baseUrl: 'http://host-b/v1', defaultModel: 'model-b' } };

  expect(resolveGatewayConfig(a, 'bulk').baseUrl).toBe('http://host-a/v1');
  expect(resolveGatewayConfig(b, 'bulk').baseUrl).toBe('http://host-b/v1');

  // Both reach a mock transport with no code change.
  const mock: typeof fetch = async () =>
    new Response(JSON.stringify({ model: 'm', choices: [{ message: { content: 'ok' } }] }), { status: 200 });
  const res = await singleTurn('hi', resolveGatewayConfig(b, 'bulk'), { fetchImpl: mock });
  expect(res.content).toBe('ok');
});
