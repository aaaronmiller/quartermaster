import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeVerdict } from '../../src/core/audit/auditor';
import { compilePlan } from '../../src/core/deploy/plan';
import {
  ProfileRegistry,
  ProfileValidationFailed,
  loadBuiltInProfiles,
} from '../../src/core/profiles/profile-registry';
import type { Artifact, HarnessProfile } from '../../src/core/types';

function hookArtifact(): Artifact {
  return {
    id: 'hook-1',
    type: 'hook',
    name: 'Hook',
    path: '/library/hooks/preflight.hook.yaml',
    organizationalPath: 'hooks',
    hash: 'hash',
    size: 1,
    metadata: {},
    source: { kind: 'self', path: '/library/hooks/preflight.hook.yaml' },
    capabilities: [{ type: 'hooks', dialect: 'custom' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'self:/library/hooks/preflight.hook.yaml',
  };
}

function skillArtifact(): Artifact {
  return {
    ...hookArtifact(),
    id: 'skill-1',
    type: 'skill',
    name: 'Skill',
    path: '/library/research/SKILL.md',
    organizationalPath: 'research',
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
  };
}

function customProfile(projectSkillPath = '.custom/skills'): HarnessProfile {
  return {
    id: 'custom',
    name: 'Custom',
    version: 1,
    guidanceFilename: 'AGENTS.md',
    artifactTypes: [
      {
        type: 'skill',
        locations: { global: '~/.custom/skills', project: projectSkillPath },
        flat: false,
        configFormat: null,
      },
      {
        type: 'hook',
        locations: { global: '~/.custom/hooks', project: '.custom/hooks' },
        flat: false,
        configFormat: 'yaml',
      },
    ],
    capabilities: [
      { type: 'skill', dialects: ['agent-md'] },
      { type: 'hooks', dialects: ['custom'] },
    ],
    deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
  };
}

describe('profile schema (FR-020)', () => {
  test('built-in profiles expose declarative layout, capabilities, guidance, and version', () => {
    const profiles = loadBuiltInProfiles();
    expect(profiles.map((profile) => profile.id).sort()).toEqual([
      'antigravity',
      'claude-code',
      'codex',
      'opencode',
    ]);
    for (const profile of profiles) {
      expect(profile.version).toBeGreaterThanOrEqual(1);
      expect(profile.guidanceFilename).toMatch(/^(AGENTS|CLAUDE)\.md$/);
      expect(profile.artifactTypes.length).toBeGreaterThan(0);
      expect(profile.capabilities.length).toBeGreaterThan(0);
      for (const entry of profile.artifactTypes) {
        expect(entry.type).toBeTruthy();
        expect(entry.locations.global || entry.locations.project).toBeTruthy();
        expect(typeof entry.flat).toBe('boolean');
        expect('configFormat' in entry).toBe(true);
      }
    }
  });

  test('malformed profiles are rejected with a plain field-level reason', () => {
    const registry = new ProfileRegistry({ includeDefaultDirs: false });
    expect(() => registry.addProfile({ ...customProfile(), artifactTypes: [] })).toThrow(
      ProfileValidationFailed,
    );
  });

  test('custom profile data fully drives audit with no harness-specific branch', () => {
    const profile = customProfile();
    const verdict = computeVerdict(hookArtifact(), profile);
    expect(verdict.verdict).toBe('deployable');
    expect(verdict.harness).toBe('custom');
  });
});

describe('built-in profile conventions (FR-021)', () => {
  test('Claude Code, Codex, Antigravity, and OpenCode capture key convention differences', () => {
    const byId = new Map(loadBuiltInProfiles().map((profile) => [profile.id, profile]));
    expect(byId.get('claude-code')?.guidanceFilename).toBe('CLAUDE.md');
    expect(byId.get('claude-code')?.artifactTypes.find((entry) => entry.type === 'skill')?.flat).toBe(true);
    expect(byId.get('claude-code')?.capabilities.some((cap) => cap.type === 'hooks')).toBe(true);
    expect(byId.get('claude-code')?.artifactTypes.find((entry) => entry.type === 'mcp-config')?.configFormat).toBe('claude-mcp-json');

    expect(byId.get('codex')?.guidanceFilename).toBe('AGENTS.md');
    expect(byId.get('codex')?.artifactTypes.find((entry) => entry.type === 'mcp-config')?.configFormat).toBe('codex-toml');
    expect(byId.get('codex')?.capabilities.some((cap) => cap.type === 'hooks')).toBe(false);

    expect(byId.get('antigravity')?.artifactTypes.find((entry) => entry.type === 'mcp-config')?.configFormat).toBe('antigravity-json');
    expect(byId.get('antigravity')?.capabilities.some((cap) => cap.type === 'hooks')).toBe(true);

    expect(byId.get('opencode')?.artifactTypes.find((entry) => entry.type === 'skill')?.dirname).toBe('skill');
    expect(byId.get('opencode')?.artifactTypes.find((entry) => entry.type === 'mcp-config')?.configFormat).toBe('opencode-json');
  });
});

describe('custom and versionable profiles (FR-022/023)', () => {
  test('dropping a YAML profile into a profile directory registers it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qm-profiles-'));
    writeProfile(dir, '.custom/skills');
    const registry = new ProfileRegistry({ includeDefaultDirs: false, profileDirs: [dir] });
    expect(registry.getProfile('custom')?.version).toBe(1);
    expect(computeVerdict(hookArtifact(), registry.getProfile('custom')!).verdict).toBe('deployable');
  });

  test('editing profile data changes subsequent deployment plans without code changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'qm-profiles-'));
    writeProfile(dir, '.custom/skills');
    const artifact = skillArtifact();
    const firstProfile = new ProfileRegistry({ includeDefaultDirs: false, profileDirs: [dir] }).getProfile('custom')!;
    const firstVerdict = computeVerdict(artifact, firstProfile);
    const firstPlan = compilePlan([artifact], [firstVerdict], firstProfile);
    expect(firstPlan.operations[0]?.targetPath).toContain('.custom/skills');

    writeProfile(dir, '.custom-v2/skills');
    const secondProfile = new ProfileRegistry({ includeDefaultDirs: false, profileDirs: [dir] }).getProfile('custom')!;
    const secondVerdict = computeVerdict(artifact, secondProfile);
    const secondPlan = compilePlan([artifact], [secondVerdict], secondProfile);
    expect(secondPlan.operations[0]?.targetPath).toContain('.custom-v2/skills');
  });

  test('qm profile add/list/validate manages custom profile files', () => {
    const sourceDir = mkdtempSync(join(tmpdir(), 'qm-profile-source-'));
    const profileDir = mkdtempSync(join(tmpdir(), 'qm-profile-target-'));
    writeProfile(sourceDir, '.custom/skills');
    const sourceFile = join(sourceDir, 'custom.yaml');
    const env = { ...process.env, QM_PROFILE_DIR: profileDir };
    const run = (args: string[]) => {
      const out = execFileSync('bun', ['src/cli/index.ts', 'profile', ...args, '--json'], {
        cwd: process.cwd(),
        env,
        encoding: 'utf8',
      });
      return JSON.parse(out) as { ok: boolean; data?: Record<string, unknown> };
    };

    expect(run(['validate', sourceFile]).ok).toBe(true);
    expect(run(['add', sourceFile]).ok).toBe(true);
    const list = run(['list']);
    expect(list.ok).toBe(true);
    expect((list.data?.profiles as Array<{ id: string }>).map((profile) => profile.id)).toContain('custom');
  });
});

function writeProfile(dir: string, projectSkillPath: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'custom.yaml'),
    `id: custom
name: Custom
version: 1
guidanceFilename: AGENTS.md
artifactTypes:
  - type: skill
    locations: { global: "~/.custom/skills", project: "${projectSkillPath}" }
    flat: false
    configFormat: null
  - type: hook
    locations: { global: "~/.custom/hooks", project: ".custom/hooks" }
    flat: false
    configFormat: yaml
capabilities:
  - type: skill
    dialects: [agent-md]
  - type: hooks
    dialects: [custom]
deployment:
  method: link
  crossDevice: false
  priorStateBackup: true
`,
  );
}
