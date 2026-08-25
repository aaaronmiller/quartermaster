// A package's members must keep the relative paths its own documentation
// refers to. The disambiguation pass previously grouped operations by the
// parent directory of each file, so every skill's `references/` subdirectory
// looked like a package named `references`. Hundreds shared that name and came
// from different source roots, so all but one were renamed to
// `<skill>-references` -- while the skill's prose still said `references/x.md`.
// 541 of 545 disclosure paths across 117 deployed skills resolved to nothing.
import { describe, expect, test } from 'bun:test';
import { compilePlan } from '@core/deploy/plan';
import type { Artifact, HarnessProfile } from '@core/types';

const profile: HarnessProfile = {
  id: 'test-harness',
  name: 'Test',
  version: 1,
  guidanceFilename: 'AGENTS.md',
  artifactTypes: [
    {
      type: 'skill',
      locations: { global: '/target/skills', project: '.test/skills' },
      flat: false,
      configFormat: null,
      dirname: 'skills',
    },
  ],
  capabilities: [{ type: 'skill', dialects: ['agent-md'] }],
  deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
};

function skill(id: string, root: string, members: string[]): Artifact {
  return {
    id,
    type: 'skill',
    name: id,
    path: `${root}/SKILL.md`,
    hash: id,
    size: 1,
    metadata: { packageMembers: members },
    source: { kind: 'local', path: root },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '',
    updatedAt: '',
    organizationalPath: '',
    packageRoot: root,
  } as unknown as Artifact;
}

const deployable = (id: string) => ({
  artifactId: id,
  harness: 'test-harness',
  verdict: 'deployable' as const,
  reason: 'ok',
});

describe('disambiguatePackages', () => {
  test('two skills each keep their own references/ path', () => {
    const a = skill('a', '/lib/first-party/custom-skills/alpha', ['SKILL.md', 'references/guide.md']);
    const b = skill('b', '/lib/first-party/custom-skills/beta', ['SKILL.md', 'references/guide.md']);
    const plan = compilePlan([a, b], [deployable('a'), deployable('b')], profile);
    const targets = plan.operations.map((o) => o.targetPath);
    expect(targets).toContain('/target/skills/alpha/references/guide.md');
    expect(targets).toContain('/target/skills/beta/references/guide.md');
    // The failure mode: a member relocated into a renamed subdirectory.
    expect(targets.some((t) => t.includes('-references/'))).toBe(false);
  });

  test('genuinely colliding package names are still disambiguated', () => {
    // Same package name `cso` from two different sources: one must move, and
    // the first-party copy keeps the bare name.
    const mine = skill('mine', '/lib/first-party/custom-skills/cso', ['SKILL.md']);
    const theirs = skill('theirs', '/lib/third-party/gstack/cso', ['SKILL.md']);
    const plan = compilePlan([mine, theirs], [deployable('mine'), deployable('theirs')], profile);
    const targets = plan.operations.map((o) => o.targetPath);
    expect(targets).toContain('/target/skills/cso/SKILL.md');
    expect(targets).toContain('/target/skills/gstack-cso/SKILL.md');
  });

  test('a renamed package keeps its members relative layout', () => {
    const mine = skill('mine', '/lib/first-party/custom-skills/cso', ['SKILL.md']);
    const theirs = skill('theirs', '/lib/third-party/gstack/cso', ['SKILL.md', 'references/deep/note.md']);
    const plan = compilePlan([mine, theirs], [deployable('mine'), deployable('theirs')], profile);
    const targets = plan.operations.map((o) => o.targetPath);
    expect(targets).toContain('/target/skills/gstack-cso/references/deep/note.md');
  });

  test('one package owning a name is never renamed, however many files', () => {
    const solo = skill('solo', '/lib/third-party/vendor/tool', [
      'SKILL.md', 'references/a.md', 'references/b.md', 'scripts/run.sh',
    ]);
    const plan = compilePlan([solo], [deployable('solo')], profile);
    for (const op of plan.operations) {
      expect(op.targetPath.startsWith('/target/skills/tool/')).toBe(true);
    }
  });
});
