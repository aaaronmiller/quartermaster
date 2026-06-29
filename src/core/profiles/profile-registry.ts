// ─────────────────────────────────────────────────────────────
// Quartermaster — Harness Profile Registry
// Loads, validates, and manages declarative YAML profiles.
// ─────────────────────────────────────────────────────────────

import type {
  ArtifactType,
  ArtifactTypeLocation,
  CapabilitySupport,
  DeploymentConfig,
  HarnessProfile,
} from '@core/types';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import yaml from 'js-yaml';
import { join } from 'path';

interface ProfileValidationIssue {
  field: string;
  message: string;
}

// ─── Built-in profiles ──────────────────────────────────────

const BUILTIN_PROFILES: HarnessProfile[] = [
  {
    name: 'claude-code',
    artifactTypes: [
      {
        type: 'skill',
        locations: { global: '/home/cheta/.claude/skills/', project: '.claude/skills/' },
        flat: false,
        configFormat: null,
      },
      {
        type: 'plugin',
        locations: { global: '/home/cheta/.claude/plugins/', project: '.claude/plugins/' },
        flat: false,
        configFormat: 'json',
      },
      {
        type: 'hook',
        locations: { global: '/home/cheta/.claude/hooks/', project: '.claude/hooks/' },
        flat: false,
        configFormat: null,
      },
      {
        type: 'mcp-config',
        locations: { global: '/home/cheta/.claude/mcp.json', project: '.claude/mcp.json' },
        flat: true,
        configFormat: 'json',
      },
      {
        type: 'slash-command',
        locations: { global: '/home/cheta/.claude/commands/', project: '.claude/commands/' },
        flat: false,
        configFormat: 'md',
      },
    ],
    capabilities: [
      { type: 'skill', dialects: ['agent-md'] },
      { type: 'hooks', dialects: ['claude'] },
      { type: 'mcp', dialects: ['single-server', 'multi-server'] },
      { type: 'plugin', dialects: ['generic'] },
      { type: 'commands', dialects: ['agent'] },
    ],
    deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
  },
  {
    name: 'codex',
    artifactTypes: [
      {
        type: 'skill',
        locations: { global: '/home/cheta/.codex/skills/', project: '.codex/skills/' },
        flat: true,
        configFormat: null,
      },
      {
        type: 'plugin',
        locations: { global: '/home/cheta/.codex/plugins/', project: '.codex/plugins/' },
        flat: false,
        configFormat: 'json',
      },
      {
        type: 'mcp-config',
        locations: { global: '/home/cheta/.codex/mcp.json', project: '.codex/mcp.json' },
        flat: true,
        configFormat: 'json',
      },
    ],
    capabilities: [
      { type: 'skill', dialects: ['agent-md'] },
      { type: 'mcp', dialects: ['single-server', 'multi-server'] },
      { type: 'plugin', dialects: ['generic'] },
    ],
    deployment: { method: 'copy', crossDevice: true, priorStateBackup: true },
  },
  {
    name: 'antigravity',
    artifactTypes: [
      {
        type: 'skill',
        locations: { global: '/home/cheta/.antigravity/skills/', project: '.antigravity/skills/' },
        flat: false,
        configFormat: null,
      },
      {
        type: 'mcp-config',
        locations: {
          global: '/home/cheta/.antigravity/servers.json',
          project: '.antigravity/servers.json',
        },
        flat: true,
        configFormat: 'json',
      },
    ],
    capabilities: [
      { type: 'skill', dialects: ['agent-md'] },
      { type: 'mcp', dialects: ['single-server'] },
    ],
    deployment: { method: 'link', crossDevice: false, priorStateBackup: true },
  },
  {
    name: 'opencode',
    artifactTypes: [
      {
        type: 'skill',
        locations: { global: '/home/cheta/.opencode/skills/', project: '.opencode/skills/' },
        flat: false,
        configFormat: null,
      },
      {
        type: 'plugin',
        locations: { global: '/home/cheta/.opencode/plugins/', project: '.opencode/plugins/' },
        flat: false,
        configFormat: 'json',
      },
    ],
    capabilities: [
      { type: 'skill', dialects: ['agent-md'] },
      { type: 'plugin', dialects: ['generic'] },
    ],
    deployment: { method: 'copy', crossDevice: false, priorStateBackup: true },
  },
];

// ─── Profile Registry ───────────────────────────────────────

export class ProfileRegistry {
  private profiles = new Map<string, HarnessProfile>();

  constructor() {
    // Load built-in profiles
    for (const p of BUILTIN_PROFILES) {
      this.profiles.set(p.name, p);
    }

    // Load from profiles/ directory (project-level)
    this.loadFromDir('profiles');

    // Load from ~/.config/quartermaster/profiles/ (user-level overrides)
    const home = process.env.HOME || process.env.USERPROFILE || '~';
    this.loadFromDir(join(home, '.config', 'quartermaster', 'profiles'));
  }

  /** List all loaded profile names. */
  listProfiles(): HarnessProfile[] {
    return Array.from(this.profiles.values());
  }

  /** Get a profile by name. */
  getProfile(name: string): HarnessProfile | null {
    return this.profiles.get(name) ?? null;
  }

  /** Add or update a profile. */
  addProfile(profile: HarnessProfile): void {
    const errors = validateProfile(profile);
    if (errors.length > 0) {
      throw new ProfileValidationFailed(errors.map((e) => `${e.field}: ${e.message}`).join('; '));
    }
    this.profiles.set(profile.name, profile);
  }

  /** Remove a profile. Built-in profiles cannot be removed. */
  removeProfile(name: string): void {
    if (BUILTIN_PROFILES.some((p) => p.name === name)) {
      throw new ProfileError(`Cannot remove built-in profile '${name}'`);
    }
    this.profiles.delete(name);
  }

  // ── Internal ──────────────────────────────────────────────

  private loadFromDir(dir: string): void {
    if (!existsSync(dir)) return;

    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.endsWith('.yaml') && !entry.endsWith('.yml')) continue;

      const filePath = join(dir, entry);
      let parsed: Record<string, unknown>;
      try {
        const content = readFileSync(filePath, 'utf-8');
        parsed = yaml.load(content) as Record<string, unknown>;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new ProfileError(`YAML error in ${entry}: ${msg}`);
      }

      const profile = parseProfileYaml(parsed, entry);
      this.profiles.set(profile.name, profile);
    }
  }
}

// ─── Validation ─────────────────────────────────────────────

function validateProfile(p: HarnessProfile): ProfileValidationIssue[] {
  const errors: ProfileValidationIssue[] = [];

  if (!p.name) {
    errors.push({ field: 'name', message: 'Profile name is required' });
  }

  if (!p.artifactTypes || p.artifactTypes.length === 0) {
    errors.push({
      field: 'artifactTypes',
      message: 'At least one artifact type location required',
    });
  }

  for (let i = 0; i < p.artifactTypes.length; i++) {
    const at = p.artifactTypes[i]!;
    if (!at.type) errors.push({ field: `artifactTypes[${i}].type`, message: 'Required' });
    if (!at.locations?.global && !at.locations?.project) {
      errors.push({
        field: `artifactTypes[${i}].locations`,
        message: 'At least one of global/project required',
      });
    }
  }

  if (!p.capabilities || p.capabilities.length === 0) {
    errors.push({
      field: 'capabilities',
      message: 'At least one capability support entry required',
    });
  }

  if (!p.deployment) {
    errors.push({ field: 'deployment', message: 'Deployment config is required' });
  } else {
    if (p.deployment.method !== 'link' && p.deployment.method !== 'copy') {
      errors.push({ field: 'deployment.method', message: 'Must be "link" or "copy"' });
    }
  }

  return errors;
}

// ─── YAML Parsing ───────────────────────────────────────────

function parseProfileYaml(raw: Record<string, unknown>, fileName: string): HarnessProfile {
  const name = raw.name as string;
  if (!name) {
    throw new ProfileError(`Profile in ${fileName} missing required 'name' field`);
  }

  const rawTypes = (raw.artifactTypes as Array<Record<string, unknown>>) ?? [];
  const artifactTypes: ArtifactTypeLocation[] = rawTypes.map((t: Record<string, unknown>) => ({
    type: t.type as ArtifactType,
    locations: {
      global: (t.locations as Record<string, string>)?.global ?? '',
      project: (t.locations as Record<string, string>)?.project ?? '',
    },
    flat: (t.flat as boolean) ?? false,
    configFormat: (t.configFormat as string | null) ?? null,
  }));

  const rawCaps = (raw.capabilities as Array<Record<string, unknown>>) ?? [];
  const capabilities: CapabilitySupport[] = rawCaps.map((c: Record<string, unknown>) => ({
    type: c.type as string,
    dialects: (c.dialects as string[]) ?? [],
  }));

  const dep = raw.deployment as Record<string, unknown> | undefined;
  const deployment: DeploymentConfig = {
    method: (dep?.method as 'link' | 'copy') ?? 'link',
    crossDevice: (dep?.crossDevice as boolean) ?? false,
    priorStateBackup: (dep?.priorStateBackup as boolean) ?? true,
  };

  return { name, artifactTypes, capabilities, deployment };
}

// ─── Error Types ────────────────────────────────────────────

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
