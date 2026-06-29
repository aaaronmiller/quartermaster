// ─────────────────────────────────────────────────────────────
// Quartermaster — Harness Profile Registry
// Declarative profile data for audit and deployment engines.
// ─────────────────────────────────────────────────────────────

import type {
  ArtifactType,
  ArtifactTypeLocation,
  CapabilitySupport,
  DeploymentConfig,
  HarnessProfile,
} from '@core/types';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export interface ProfileValidationIssue {
  field: string;
  message: string;
}

export interface ProfileRegistryOptions {
  /** Additional directories containing .json/.yaml profiles. */
  profileDirs?: string[];
  /** Load project/user default directories. Default true. */
  includeDefaultDirs?: boolean;
}

const BUILTIN_PROFILES: HarnessProfile[] = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    version: 1,
    guidanceFilename: 'CLAUDE.md',
    artifactTypes: [
      loc('skill', '~/.claude/skills', '.claude/skills', true, null, 'skills'),
      loc('plugin', '~/.claude/plugins', '.claude/plugins', false, 'claude-plugin-json', 'plugins'),
      loc('agent', '~/.claude/agents', '.claude/agents', false, 'yaml', 'agents'),
      loc('hook', '~/.claude/hooks', '.claude/hooks', false, 'yaml', 'hooks'),
      loc('mcp-config', '~/.claude/.mcp.json', '.claude/.mcp.json', true, 'claude-mcp-json'),
      loc('slash-command', '~/.claude/commands', '.claude/commands', false, 'markdown', 'commands'),
      loc('output-style', '~/.claude/output-styles', '.claude/output-styles', false, 'markdown'),
      loc('script', '~/.claude/scripts', '.claude/scripts', false, null, 'scripts'),
    ],
    capabilities: [
      cap('skill', ['agent-md']),
      cap('plugin', ['generic']),
      cap('agent-config', ['generic']),
      cap('hooks', ['claude', 'plugin']),
      cap('mcp', ['single-server', 'multi-server', 'claude-mcp-json']),
      cap('commands', ['claude']),
      cap('output-style', ['generic']),
      cap('scripts', ['bash', 'zsh', 'python', 'node', 'typescript']),
    ],
    deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
  },
  {
    id: 'codex',
    name: 'Codex',
    version: 1,
    guidanceFilename: 'AGENTS.md',
    artifactTypes: [
      loc('skill', '~/.codex/skills', '.codex/skills', true, null, 'skills'),
      loc('plugin', '~/.codex/plugins', '.codex/plugins', false, 'json', 'plugins'),
      loc('mcp-config', '~/.codex/config.toml', '.codex/config.toml', true, 'codex-toml'),
      loc('slash-command', '~/.codex/commands', '.codex/commands', false, 'markdown', 'commands'),
      loc('output-style', '~/.codex/output-styles', '.codex/output-styles', false, 'markdown'),
      loc('script', '~/.codex/scripts', '.codex/scripts', false, null, 'scripts'),
    ],
    capabilities: [
      cap('skill', ['agent-md']),
      cap('plugin', ['generic']),
      cap('mcp', ['single-server', 'multi-server', 'codex-toml']),
      cap('commands', ['claude']),
      cap('output-style', ['generic']),
      cap('scripts', ['bash', 'zsh', 'python', 'node', 'typescript']),
    ],
    deployment: { method: 'copy', crossDevice: true, priorStateBackup: true },
  },
  {
    id: 'antigravity',
    name: 'Antigravity',
    version: 1,
    guidanceFilename: 'AGENTS.md',
    artifactTypes: [
      loc('skill', '~/.agents/skills', '.agents/skills', false, null, 'skills'),
      loc('agent', '~/.agents/agents', '.agents/agents', false, 'yaml', 'agents'),
      loc('hook', '~/.agents/hooks', '.agents/hooks', false, 'yaml', 'hooks'),
      loc('mcp-config', '~/.agents/mcp_config.json', '.agents/mcp_config.json', true, 'antigravity-json'),
      loc('slash-command', '~/.agents/commands', '.agents/commands', false, 'markdown', 'commands'),
      loc('script', '~/.agents/scripts', '.agents/scripts', false, null, 'scripts'),
    ],
    capabilities: [
      cap('skill', ['agent-md']),
      cap('agent-config', ['generic']),
      cap('hooks', ['antigravity']),
      cap('mcp', ['single-server', 'antigravity-json']),
      cap('commands', ['claude']),
      cap('scripts', ['bash', 'zsh', 'python', 'node', 'typescript']),
    ],
    deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    version: 1,
    guidanceFilename: 'AGENTS.md',
    artifactTypes: [
      loc('skill', '~/.config/opencode/skill', '.opencode/skill', false, null, 'skill'),
      loc('agent', '~/.config/opencode/agent', '.opencode/agent', false, 'yaml', 'agent'),
      loc('hook', '~/.config/opencode/hook', '.opencode/hook', false, 'yaml', 'hook'),
      loc('mcp-config', '~/.config/opencode/opencode.json', '.opencode/opencode.json', true, 'opencode-json'),
      loc('slash-command', '~/.config/opencode/command', '.opencode/command', false, 'markdown', 'command'),
    ],
    capabilities: [
      cap('skill', ['agent-md']),
      cap('agent-config', ['generic']),
      cap('hooks', ['opencode']),
      cap('mcp', ['single-server', 'opencode-json']),
      cap('commands', ['claude']),
    ],
    deployment: { method: 'copy', crossDevice: false, priorStateBackup: true },
  },
];

export class ProfileRegistry {
  private profiles = new Map<string, HarnessProfile>();

  constructor(options: ProfileRegistryOptions = {}) {
    for (const profile of BUILTIN_PROFILES) {
      this.profiles.set(profile.id, profile);
    }

    const dirs = [
      ...(options.includeDefaultDirs === false ? [] : defaultProfileDirs()),
      ...(options.profileDirs ?? []),
    ];
    for (const dir of dirs) this.loadFromDir(dir);
  }

  listProfiles(): HarnessProfile[] {
    return Array.from(this.profiles.values());
  }

  getProfile(id: string): HarnessProfile | null {
    return this.profiles.get(id) ?? null;
  }

  addProfile(profile: HarnessProfile): void {
    assertValidProfile(profile);
    this.profiles.set(profile.id, profile);
  }

  removeProfile(id: string): void {
    if (BUILTIN_PROFILES.some((profile) => profile.id === id)) {
      throw new ProfileError(`cannot remove built-in profile '${id}'`);
    }
    this.profiles.delete(id);
  }

  loadFromDir(dir: string): void {
    if (!existsSync(dir)) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!/\.(ya?ml|json)$/.test(entry)) continue;
      const filePath = join(dir, entry);
      const raw = parseProfileFile(filePath);
      const profile = normalizeProfile(raw, entry);
      this.addProfile(profile);
    }
  }
}

export function loadBuiltInProfiles(): HarnessProfile[] {
  return BUILTIN_PROFILES.map((profile) => structuredClone(profile));
}

export function loadProfileFromFile(filePath: string): HarnessProfile {
  const raw = parseProfileFile(filePath);
  return normalizeProfile(raw, filePath);
}

export function validateProfile(profile: HarnessProfile): ProfileValidationIssue[] {
  const issues: ProfileValidationIssue[] = [];
  if (!profile.id) issues.push(issue('id', 'profile id is required'));
  if (!profile.name) issues.push(issue('name', 'profile name is required'));
  if (!Number.isInteger(profile.version) || profile.version < 1) {
    issues.push(issue('version', 'version must be a positive integer'));
  }
  if (!profile.guidanceFilename) {
    issues.push(issue('guidanceFilename', 'guidance filename is required'));
  }
  if (!Array.isArray(profile.artifactTypes) || profile.artifactTypes.length === 0) {
    issues.push(issue('artifactTypes', 'at least one artifact type location is required'));
  } else {
    profile.artifactTypes.forEach((entry, i) => validateArtifactType(entry, i, issues));
  }
  if (!Array.isArray(profile.capabilities) || profile.capabilities.length === 0) {
    issues.push(issue('capabilities', 'at least one capability entry is required'));
  } else {
    profile.capabilities.forEach((entry, i) => validateCapability(entry, i, issues));
  }
  if (!profile.deployment) {
    issues.push(issue('deployment', 'deployment config is required'));
  } else if (profile.deployment.method !== 'link' && profile.deployment.method !== 'copy') {
    issues.push(issue('deployment.method', 'must be "link" or "copy"'));
  }
  return issues;
}

function assertValidProfile(profile: HarnessProfile): void {
  const issues = validateProfile(profile);
  if (issues.length > 0) {
    throw new ProfileValidationFailed(issues.map((i) => `${i.field}: ${i.message}`).join('; '));
  }
}

function normalizeProfile(raw: Record<string, unknown>, fileName: string): HarnessProfile {
  const id = stringField(raw.id) ?? stringField(raw.name)?.toLowerCase().replace(/\s+/g, '-');
  if (!id) throw new ProfileError(`profile in ${fileName} missing required id/name`);

  const rawTypes = arrayField(raw.artifactTypes) ?? arrayField(raw.types) ?? [];
  const artifactTypes = rawTypes.map((entry, i) => normalizeArtifactType(entry, i));
  const capabilities = (arrayField(raw.capabilities) ?? []).map((entry, i) => normalizeCapability(entry, i));
  const dep = objectField(raw.deployment);
  const profile: HarnessProfile = {
    id,
    name: stringField(raw.name) ?? id,
    version: numberField(raw.version) ?? 1,
    guidanceFilename: stringField(raw.guidanceFilename) ?? (id === 'claude-code' ? 'CLAUDE.md' : 'AGENTS.md'),
    artifactTypes,
    capabilities,
    deployment: {
      method: dep?.method === 'copy' ? 'copy' : 'link',
      crossDevice: booleanField(dep?.crossDevice) ?? false,
      priorStateBackup: booleanField(dep?.priorStateBackup) ?? true,
    },
  };
  assertValidProfile(profile);
  return profile;
}

function normalizeArtifactType(raw: unknown, index: number): ArtifactTypeLocation {
  const obj = objectField(raw);
  if (!obj) throw new ProfileError(`artifactTypes[${index}] must be an object`);
  const locations = objectField(obj.locations);
  const dirname = stringField(obj.dirname);
  return {
    type: obj.type as ArtifactType,
    locations: {
      global: stringField(locations?.global) ?? '',
      project: stringField(locations?.project) ?? '',
    },
    flat: booleanField(obj.flat) ?? false,
    configFormat: stringField(obj.configFormat) ?? null,
    ...(dirname ? { dirname } : {}),
  };
}

function normalizeCapability(raw: unknown, index: number): CapabilitySupport {
  const obj = objectField(raw);
  if (!obj) throw new ProfileError(`capabilities[${index}] must be an object`);
  return {
    type: stringField(obj.type) ?? '',
    dialects: arrayField(obj.dialects)?.map((value) => String(value)) ?? [],
  };
}

function validateArtifactType(
  entry: ArtifactTypeLocation,
  index: number,
  issues: ProfileValidationIssue[],
): void {
  if (!entry.type) issues.push(issue(`artifactTypes[${index}].type`, 'type is required'));
  if (!entry.locations?.global && !entry.locations?.project) {
    issues.push(issue(`artifactTypes[${index}].locations`, 'global or project location is required'));
  }
  if (typeof entry.flat !== 'boolean') {
    issues.push(issue(`artifactTypes[${index}].flat`, 'flat must be boolean'));
  }
}

function validateCapability(
  entry: CapabilitySupport,
  index: number,
  issues: ProfileValidationIssue[],
): void {
  if (!entry.type) issues.push(issue(`capabilities[${index}].type`, 'type is required'));
  if (!Array.isArray(entry.dialects)) {
    issues.push(issue(`capabilities[${index}].dialects`, 'dialects must be a list'));
  }
}

function parseProfileFile(filePath: string): Record<string, unknown> {
  const raw = readFileSync(filePath, 'utf8');
  try {
    const parsed = filePath.endsWith('.json') ? JSON.parse(raw) : yaml.load(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch (err) {
    throw new ProfileError(`${filePath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function defaultProfileDirs(): string[] {
  const home = process.env.HOME || process.env.USERPROFILE || '~';
  return ['profiles', join(home, '.config', 'quartermaster', 'profiles')];
}

function loc(
  type: ArtifactType,
  global: string,
  project: string,
  flat: boolean,
  configFormat: string | null,
  dirname?: string,
): ArtifactTypeLocation {
  return { type, locations: { global, project }, flat, configFormat, ...(dirname ? { dirname } : {}) };
}

function cap(type: string, dialects: string[]): CapabilitySupport {
  return { type, dialects };
}

function issue(field: string, message: string): ProfileValidationIssue {
  return { field, message };
}

function objectField(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayField(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProfileError';
  }
}

export class ProfileValidationFailed extends Error {
  constructor(messages: string) {
    super(messages);
    this.name = 'ProfileValidationFailed';
  }
}
