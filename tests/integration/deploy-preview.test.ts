import { expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeCompatibilityMatrix } from '../../src/core/audit/auditor';
import { flattenOperations } from '../../src/core/deploy/flatten';
import { validateConfig, writeConfig, type ConfigFormat } from '../../src/core/deploy/config-writer';
import { executePlacement } from '../../src/core/deploy/placer';
import { compilePlan } from '../../src/core/deploy/plan';
import { loadBuiltInProfiles } from '../../src/core/profiles/profile-registry';
import type { Artifact } from '../../src/core/types';
import { Repository } from '../../src/storage/repository';
import { tempRepo } from '../helpers';

function artifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'skill-1',
    type: 'skill',
    name: 'Skill',
    path: '/library/research/SKILL.md',
    organizationalPath: 'research',
    hash: 'hash',
    size: 1,
    metadata: {},
    source: { kind: 'self', path: '/library/research/SKILL.md' },
    capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    importedAt: '2026-06-29T00:00:00Z',
    updatedAt: '2026-06-29T00:00:00Z',
    provenance: 'self:/library/research/SKILL.md',
    ...overrides,
  };
}

test('compilePlan lists placements, transforms, and skips without writing files', () => {
  const codex = loadBuiltInProfiles().find((profile) => profile.id === 'codex')!;
  const artifacts = [
    artifact(),
    artifact({
      id: 'mcp-1',
      type: 'mcp-config',
      name: 'MCP',
      path: '/library/mcp/filesystem.mcp.json',
      organizationalPath: '.',
      metadata: { configFormat: 'claude-mcp-json' },
      capabilities: [{ type: 'mcp', dialect: 'single-server' }],
    }),
    artifact({
      id: 'hook-1',
      type: 'hook',
      name: 'Hook',
      path: '/library/hooks/preflight.hook.yaml',
      capabilities: [{ type: 'hooks', dialect: 'claude' }],
    }),
  ];
  const targetProbe = join(mkdtempSync(join(tmpdir(), 'qm-plan-')), 'target');
  const matrix = computeCompatibilityMatrix(artifacts, [codex]);
  const plan = compilePlan(artifacts, matrix.map((row) => row[0]!), codex);

  expect(plan.operations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sourcePath: artifacts[0]!.path, method: 'copy', transform: 'flatten' }),
      expect.objectContaining({ sourcePath: artifacts[1]!.path, method: 'copy', transform: 'config-translate' }),
    ]),
  );
  expect(plan.operations[0]?.provenance).toBeTruthy();
  expect(plan.excluded).toEqual(
    expect.arrayContaining([expect.objectContaining({ artifact: 'hook-1', reason: expect.stringContaining('type') })]),
  );
  expect(existsSync(targetProbe)).toBe(false);
});

test('deployment plan surfaces provenance and risk flags before deploy', () => {
  const codex = loadBuiltInProfiles().find((profile) => profile.id === 'codex')!;
  const risky = artifact({
    id: 'risky',
    provenance: 'git:https://example.test/repo@abc123',
    riskFlags: [
      {
        artifactId: 'risky',
        type: 'network-access',
        severity: 'low',
        detail: 'fetch call',
      },
    ],
  });
  const matrix = computeCompatibilityMatrix([risky], [codex]);
  const plan = compilePlan([risky], matrix.map((row) => row[0]!), codex);
  expect(plan.operations[0]?.provenance).toContain('abc123');
  expect(plan.operations[0]?.riskFlags?.[0]?.type).toBe('network-access');
});

test('qm deploy <harness> prints a dry-run plan with operations and skips', () => {
  const { repo, dir } = tempRepo();
  repo.upsertArtifact(artifact());
  repo.upsertArtifact(
    artifact({
      id: 'hook-1',
      type: 'hook',
      name: 'Hook',
      path: '/library/hooks/preflight.hook.yaml',
      capabilities: [{ type: 'hooks', dialect: 'claude' }],
    }),
  );
  repo.close();

  const out = execFileSync('bun', ['src/cli/index.ts', 'deploy', 'codex', '--json'], {
    cwd: process.cwd(),
    env: { ...process.env, QM_DB_PATH: join(dir, 'catalog.sqlite') },
    encoding: 'utf8',
  });
  const parsed = JSON.parse(out) as {
    ok: boolean;
    data?: { mode: string; requiresConfirmation: boolean; plan: { operations: unknown[]; excluded: unknown[] } };
  };
  expect(parsed.ok).toBe(true);
  expect(parsed.data?.mode).toBe('dry-run');
  expect(parsed.data?.requiresConfirmation).toBe(true);
  expect(parsed.data?.plan.operations.length).toBeGreaterThan(0);
  expect(parsed.data?.plan.excluded.length).toBeGreaterThan(0);
});

test('plan excludes incompatible artifacts while deploying compatible ones', () => {
  const codex = loadBuiltInProfiles().find((profile) => profile.id === 'codex')!;
  const compatible = artifact({ id: 'compatible' });
  const incompatible = artifact({
    id: 'incompatible',
    type: 'hook',
    capabilities: [{ type: 'hooks', dialect: 'claude' }],
  });
  const artifacts = [compatible, incompatible];
  const matrix = computeCompatibilityMatrix(artifacts, [codex]);
  const plan = compilePlan(artifacts, matrix.map((row) => row[0]!), codex);

  expect(plan.operations.map((op) => op.sourcePath)).toContain(compatible.path);
  expect(plan.excluded.map((skip) => skip.artifact)).toContain(incompatible.id);
});

test('flattening produces collision-safe flat targets without mutating library paths', () => {
  const operations = [
    { sourcePath: '/library/research/deep/SKILL.md', targetPath: '/target/skills/SKILL.md' },
    { sourcePath: '/library/writing/deep/SKILL.md', targetPath: '/target/skills/SKILL.md' },
    { sourcePath: '/library/coding/debug/SKILL.md', targetPath: '/target/skills/SKILL.md' },
  ];
  const originalSources = operations.map((op) => op.sourcePath);
  const flattened = flattenOperations(operations);
  const targets = flattened.operations.map((op) => op.targetPath);

  expect(new Set(targets).size).toBe(targets.length);
  expect(targets.every((target) => target.startsWith('/target/skills/'))).toBe(true);
  expect(targets.every((target) => !target.includes('/research/'))).toBe(true);
  expect(operations.map((op) => op.sourcePath)).toEqual(originalSources);
  expect(flattened.log.some((entry) => entry.reason === 'disambiguate')).toBe(true);
});

test('placer uses links when available and linked edits propagate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-place-'));
  const source = join(dir, 'source.md');
  const target = join(dir, 'target/skill.md');
  writeFileSync(source, 'v1');

  await executePlacement({
    harness: 'test',
    operations: [{ sourcePath: source, targetPath: target, method: 'link' }],
    excluded: [],
  });

  expect(lstatSync(target).isSymbolicLink()).toBe(true);
  writeFileSync(source, 'v2');
  expect(readFileSync(target, 'utf8')).toBe('v2');
});

test('placer falls back to copy when symlinks are unavailable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-place-'));
  const source = join(dir, 'source.md');
  const target = join(dir, 'target/skill.md');
  writeFileSync(source, 'copy-v1');

  const previous = process.env.QUARTERMASTER_FORCE_COPY_FALLBACK;
  process.env.QUARTERMASTER_FORCE_COPY_FALLBACK = '1';
  try {
    await executePlacement({
      harness: 'test',
      operations: [{ sourcePath: source, targetPath: target, method: 'link' }],
      excluded: [],
    });
  } finally {
    if (previous === undefined) delete process.env.QUARTERMASTER_FORCE_COPY_FALLBACK;
    else process.env.QUARTERMASTER_FORCE_COPY_FALLBACK = previous;
  }

  expect(lstatSync(target).isSymbolicLink()).toBe(false);
  expect(readFileSync(target, 'utf8')).toBe('copy-v1');
});

test('canonical MCP config renders to each built-in harness dialect', () => {
  const server = {
    name: 'filesystem',
    type: 'mcp-server' as const,
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    transport: 'stdio' as const,
  };
  const formats = loadBuiltInProfiles()
    .map((profile) => profile.artifactTypes.find((entry) => entry.type === 'mcp-config')?.configFormat)
    .filter(Boolean) as ConfigFormat[];

  expect(formats).toEqual(
    expect.arrayContaining(['claude-mcp-json', 'codex-toml', 'antigravity-json', 'opencode-json']),
  );
  const rendered = formats.map((format) => [format, writeConfig(server, format)] as const);
  for (const [format, content] of rendered) {
    expect(validateConfig(content, format)).toBe(true);
    expect(content).toContain('filesystem');
  }
  expect(new Set(rendered.map(([, content]) => content)).size).toBeGreaterThan(1);
});

test('qm deploy is dry-run by default and applies only with --yes', () => {
  const { repo, dir } = tempRepo();
  const profileDir = join(dir, 'profiles');
  const targetDir = join(dir, 'target');
  const source = join(dir, 'library/SKILL.md');
  mkdirSync(join(dir, 'library'), { recursive: true });
  writeFileSync(source, '# deploy me\n');
  writeDeployProfile(profileDir, targetDir);
  repo.upsertArtifact(
    artifact({
      id: 'deployable',
      path: source,
      organizationalPath: '.',
      capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    }),
  );
  repo.close();

  const env = { ...process.env, QM_DB_PATH: join(dir, 'catalog.sqlite'), QM_PROFILE_DIR: profileDir };
  const run = (args: string[]) => {
    const out = execFileSync('bun', ['src/cli/index.ts', 'deploy', 'custom-deploy', ...args, '--json'], {
      cwd: process.cwd(),
      env,
      encoding: 'utf8',
    });
    return JSON.parse(out) as { ok: boolean; data?: { mode: string; result?: { operations: unknown[] } } };
  };

  const preview = run([]);
  expect(preview.ok).toBe(true);
  expect(preview.data?.mode).toBe('dry-run');
  expect(existsSync(join(targetDir, 'SKILL.md'))).toBe(false);

  const applied = run(['--yes']);
  expect(applied.ok).toBe(true);
  expect(applied.data?.mode).toBe('applied');
  expect(readFileSync(join(targetDir, 'SKILL.md'), 'utf8')).toBe('# deploy me\n');
});

test('qm deploy supports configured groups and --all targets', () => {
  const dir = mkdtempSync(join(tmpdir(), 'qm-multi-deploy-'));
  const projectDir = join(dir, 'project');
  const profileDir = join(dir, 'profiles');
  const dbPath = join(dir, 'catalog.sqlite');
  const libraryDir = join(dir, 'library');
  const source = join(libraryDir, 'SKILL.md');
  const targetOne = join(dir, 'target-one');
  const targetTwo = join(dir, 'target-two');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(libraryDir, { recursive: true });
  writeFileSync(source, '# multi deploy\n');
  writeNamedDeployProfile(profileDir, 'p1', targetOne);
  writeNamedDeployProfile(profileDir, 'p2', targetTwo);
  writeFileSync(
    join(projectDir, 'quartermaster.json'),
    JSON.stringify(
      {
        dbPath,
        profileDir,
        harnesses: ['p1', 'p2'],
        harnessGroups: { pair: ['p1', 'p2'] },
      },
      null,
      2,
    ),
  );
  const repo = new Repository({ dbPath });
  repo.upsertArtifact(
    artifact({
      id: 'multi',
      path: source,
      organizationalPath: '.',
      capabilities: [{ type: 'skill', dialect: 'agent-md' }],
    }),
  );
  repo.close();

  const cli = join(process.cwd(), 'src/cli/index.ts');
  const groupOut = execFileSync('bun', [cli, 'deploy', 'pair', '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  });
  const group = JSON.parse(groupOut) as { data: { plans: unknown[] } };
  expect(group.data.plans).toHaveLength(2);

  const allOut = execFileSync('bun', [cli, 'deploy', '--all', '--yes', '--json'], {
    cwd: projectDir,
    encoding: 'utf8',
  });
  const all = JSON.parse(allOut) as { ok: boolean; data: { deployments: unknown[] } };
  expect(all.ok).toBe(true);
  expect(all.data.deployments).toHaveLength(2);
  expect(readFileSync(join(targetOne, 'SKILL.md'), 'utf8')).toBe('# multi deploy\n');
  expect(readFileSync(join(targetTwo, 'SKILL.md'), 'utf8')).toBe('# multi deploy\n');
});

test('qm deploy --scope limits placements, is idempotent, and never writes library files', () => {
  const { repo, dir } = tempRepo();
  const profileDir = join(dir, 'profiles');
  const targetDir = join(dir, 'target');
  const research = join(dir, 'library/research/SKILL.md');
  const writing = join(dir, 'library/writing/SKILL.md');
  mkdirSync(join(dir, 'library/research'), { recursive: true });
  mkdirSync(join(dir, 'library/writing'), { recursive: true });
  writeFileSync(research, '# research\n');
  writeFileSync(writing, '# writing\n');
  writeDeployProfile(profileDir, targetDir);
  repo.upsertArtifact(
    artifact({
      id: 'research',
      path: research,
      organizationalPath: 'research',
      metadata: { tags: ['keep'] },
    }),
  );
  repo.upsertArtifact(
    artifact({
      id: 'writing',
      name: 'Writing',
      path: writing,
      organizationalPath: 'writing',
      metadata: { tags: ['skip'] },
    }),
  );
  repo.close();

  const env = { ...process.env, QM_DB_PATH: join(dir, 'catalog.sqlite'), QM_PROFILE_DIR: profileDir };
  const run = () => {
    const out = execFileSync(
      'bun',
      ['src/cli/index.ts', 'deploy', 'custom-deploy', '--scope=path:research', '--yes', '--json'],
      { cwd: process.cwd(), env, encoding: 'utf8' },
    );
    return JSON.parse(out) as { data: { result: { operations: Array<{ status: string }> } } };
  };

  const first = run();
  expect(first.data.result.operations.map((op) => op.status)).toEqual(['placed']);
  expect(readFileSync(join(targetDir, 'SKILL.md'), 'utf8')).toBe('# research\n');
  expect(readFileSync(research, 'utf8')).toBe('# research\n');
  expect(readFileSync(writing, 'utf8')).toBe('# writing\n');

  const second = run();
  expect(second.data.result.operations.map((op) => op.status)).toEqual(['skipped']);
});

function writeDeployProfile(profileDir: string, targetDir: string): void {
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    join(profileDir, 'custom-deploy.yaml'),
    `id: custom-deploy
name: Custom Deploy
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

function writeNamedDeployProfile(profileDir: string, id: string, targetDir: string): void {
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
