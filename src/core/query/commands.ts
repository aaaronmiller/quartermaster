// ─────────────────────────────────────────────────────────────
// Quartermaster — Agent Query Interface (FR-130, FR-131)
// Stable machine-readable output for agentic consumers.
// ─────────────────────────────────────────────────────────────

import type { Repository } from '@storage/repository';
import type { Artifact, ArtifactType } from '@core/types';
import { computeVerdict } from '@core/audit/auditor';
import { ProfileRegistry } from '@core/profiles/profile-registry';
import { loadConfig } from '@core/config/load';
import { resolveAuthorRoot } from '@core/library/source-registry';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { suggestRelatedArtifacts } from '@core/relationships/suggest';

export interface QueryArtifactResult {
  id: string;
  type: string;
  name: string;
  org_path: string;
  path: string;
  hash: string;
  required_capabilities: string[];
  risk_flags: unknown[];
  source_id: string;
}

/** Map a catalog Artifact onto the stable machine-readable query shape. */
function toQueryResult(a: Artifact): QueryArtifactResult {
  return {
    id: a.id,
    type: a.type,
    name: a.name,
    org_path: a.organizationalPath,
    path: a.path,
    hash: a.hash,
    required_capabilities: a.capabilities.map((c) => c.type),
    risk_flags: a.riskFlags ?? [],
    source_id: a.source.kind,
  };
}

export type ArtifactRefResult = { artifact: Artifact } | { error: string };

const ID_PREFIX = 'art_';
const URI_PREFIX = 'skill://';

/**
 * Resolve an artifact reference the way agents and users actually write it.
 *
 * Precedence (exact, deterministic, never silent):
 * 1. `skill://<name>`  — scheme stripped, resolved as a name
 * 2. `art_<id>`        — internal id, then T291 migration alias
 * 3. path form         — catalog path (absolute or exact org path)
 * 4. bare name         — exact case-insensitive name / org-path basename /
 *                        path basename; more than one match is an error
 *                        listing the candidates, never an arbitrary pick.
 */
export function resolveArtifactRef(repo: Repository, ref: string): ArtifactRefResult {
  const trimmed = ref.trim();
  if (trimmed.startsWith(URI_PREFIX)) {
    return resolveByName(repo, trimmed.slice(URI_PREFIX.length), URI_PREFIX);
  }
  if (trimmed.startsWith(ID_PREFIX)) {
    const byId = repo.getArtifact(trimmed);
    if (byId) return { artifact: byId };
    const byAlias = repo.getArtifactByAlias(trimmed);
    if (byAlias) return { artifact: byAlias };
    return { error: `artifact not found: ${trimmed}` };
  }
  if (trimmed.includes('/') || trimmed.startsWith('.')) {
    const byPath = repo.getArtifactByPath(trimmed);
    if (byPath) return { artifact: byPath };
    const byOrg = repo.listArtifacts().filter((a) => a.organizationalPath === trimmed);
    const [orgMatch] = byOrg;
    if (byOrg.length === 1 && orgMatch) return { artifact: orgMatch };
    if (byOrg.length > 1) {
      return {
        error: `ambiguous reference '${trimmed}' matches ${byOrg.length} org paths: ${byOrg.map((a) => a.id).join(', ')}`,
      };
    }
    return { error: `artifact not found: ${trimmed}` };
  }
  return resolveByName(repo, trimmed, '');
}

function resolveByName(repo: Repository, name: string, prefix: string): ArtifactRefResult {
  const lower = name.toLowerCase();
  const matches = repo.listArtifacts().filter((a) => {
    const orgBase = basename(a.organizationalPath).toLowerCase();
    const pathBase = basename(dirname(a.path)).toLowerCase();
    return a.name.toLowerCase() === lower || orgBase === lower || pathBase === lower;
  });
  const [first] = matches;
  if (matches.length === 0) return { error: `artifact not found: ${prefix}${name}` };
  if (matches.length === 1 && first) return { artifact: first };
  const candidates = matches
    .map((a) => `${prefix}${a.name} (${a.id}, ${a.organizationalPath})`)
    .join('; ');
  return {
    error: `ambiguous reference '${name}' matches ${matches.length} artifacts: ${candidates}. Qualify with the id (art_...) or an exact path.`,
  };
}

export interface QueryCompatibilityResult {
  artifact_id: string;
  verdicts: Array<{ harness: string; status: string; reason?: string; transform?: string }>;
}

export interface QueryDeploymentResult {
  harness_id: string;
  active_loadout: string | null;
  deployed_artifacts: string[];
  drift: Array<{ artifact_id: string; drift_type: string }>;
  orphans: string[];
}

/** List all artifacts in the catalog with stable fields. */
export function queryArtifacts(repo: Repository, filter?: { type?: string }): { artifacts: QueryArtifactResult[] } {
  const artifacts = repo
    .listArtifacts()
    .filter((a) => !filter?.type || a.type === filter.type)
    .sort(byNameThenId);
  return { artifacts: artifacts.map(toQueryResult) };
}

/** Deterministic ordering contract: name ASC, then id ASC. */
function byNameThenId(a: Artifact, b: Artifact): number {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

/** Get a single artifact by reference (id, skill://name, path, or name). */
export function queryArtifact(repo: Repository, ref: string): QueryArtifactResult | null {
  const resolved = resolveArtifactRef(repo, ref);
  if ('error' in resolved) return null;
  return toQueryResult(resolved.artifact);
}

/** Query compatibility for an artifact across all profiles. */
export function queryCompatibility(repo: Repository, artifactId: string): QueryCompatibilityResult | null {
  const artifact = repo.getArtifact(artifactId);
  if (!artifact) return null;

  const cfg = loadConfig();
  const registry = new ProfileRegistry({ profileDirs: [cfg.profileDir] });
  const profiles = registry.listProfiles();

  const verdicts = profiles.map((profile) => {
    const v = computeVerdict(artifact, profile);
    const entry: { harness: string; status: string; reason?: string; transform?: string } = {
      harness: v.harness,
      status: v.verdict,
      reason: v.reason,
    };
    if (v.transformation) entry.transform = v.transformation;
    return entry;
  });

  return { artifact_id: artifactId, verdicts };
}

/** Query deployment status for a harness. */
export function queryDeployment(repo: Repository, harness: string): QueryDeploymentResult {
  const deployments = repo.getDeployments(harness);

  const deployedArtifacts = deployments.flatMap((d) => d.plan.operations.map((p) => p.artifactId).filter((id): id is string => typeof id === 'string'));
  const uniqueDeployed: string[] = [...new Set(deployedArtifacts)];

  // Check for drift (compare current with deployed)
  const drift: Array<{ artifact_id: string; drift_type: string }> = [];
  for (const artifactId of uniqueDeployed) {
    const artifact = repo.getArtifact(artifactId);
    if (!artifact) continue;
    // Check if artifact was modified after last deployment
    const latestDeployment = deployments
      .filter((d) => d.plan.operations.some((p) => p.artifactId === artifactId))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
    if (latestDeployment && new Date(artifact.updatedAt) > new Date(latestDeployment.timestamp)) {
      drift.push({ artifact_id: artifactId, drift_type: 'modified' });
    }
  }

  return {
    harness_id: harness,
    active_loadout: null,
    deployed_artifacts: uniqueDeployed,
    drift,
    orphans: [],
  };
}

/** Suggest explicit, pipeline-derived, and functionally related artifacts. */
export function queryRelated(repo: Repository, artifactId: string): ReturnType<typeof suggestRelatedArtifacts> {
  return suggestRelatedArtifacts(repo, artifactId);
}

/** Search artifacts by text, type, or capability. */
export function querySearch(
  repo: Repository,
  options: { text?: string; type?: string; capability?: string },
): { artifacts: QueryArtifactResult[] } {
  let artifacts = repo.listArtifacts();

  if (options.type) {
    artifacts = artifacts.filter((a) => a.type === options.type);
  }

  if (options.capability) {
    artifacts = artifacts.filter((a) =>
      a.capabilities.some((c) => c.type === options.capability),
    );
  }

  if (options.text) {
    const lower = options.text.toLowerCase();
    artifacts = artifacts.filter((a) => {
      const description = typeof a.metadata?.description === 'string' ? a.metadata.description.toLowerCase() : '';
      return (
        a.name.toLowerCase().includes(lower) ||
        a.path.toLowerCase().includes(lower) ||
        description.includes(lower)
      );
    });
  }

  return { artifacts: artifacts.sort(byNameThenId).map(toQueryResult) };
}

// ─── FR-131: scaffold a new artifact stub of a given type ────────────────────

export interface ScaffoldResult {
  type: ArtifactType;
  path: string;
}

/** Per-type stub templates for self-authored artifacts. */
export function scaffoldTemplate(type: ArtifactType, path: string): string | null {
  const baseName = path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'artifact';
  switch (type) {
    case 'skill':
      return `---\nname: ${baseName}\ndescription: Self-authored skill\nversion: 0.1.0\n---\n# ${baseName}\n`;
    case 'plugin':
      return `name: ${baseName}\ndescription: Self-authored plugin\n`;
    case 'agent':
      return `name: ${baseName}\ndescription: Self-authored agent\n`;
    case 'hook':
      return `name: ${baseName}\ndialect: claude\n`;
    case 'mcp-config':
      return JSON.stringify({ name: baseName, mcpServers: {} }, null, 2);
    case 'slash-command':
    case 'output-style':
      return `---\nname: ${baseName}\n---\n# ${baseName}\n`;
    case 'script':
      return '#!/usr/bin/env bash\nset -euo pipefail\n';
    default:
      return null;
  }
}

/**
 * Scaffold a new artifact stub of the given type at `rawPath` (relative paths
 * resolve under the first configured library root). Returns the created path or
 * throws a plain-language error.
 */
export function scaffoldArtifact(type: ArtifactType, rawPath: string, root?: string): ScaffoldResult {
  const content = scaffoldTemplate(type, rawPath);
  if (content === null) {
    throw new Error(`unsupported artifact type: ${type}. Valid types: skill, plugin, agent, hook, script, mcp-config, slash-command, output-style.`);
  }
  const config = loadConfig();
  // Prefer an explicit root, then the canonical git-tracked authoring root
  // (first-party source registry), then the configured library root.
  const base =
    root ??
    resolveAuthorRoot(config.sourceRegistry) ??
    config.roots[0] ??
    process.cwd();
  const target = isAbsolute(rawPath) ? rawPath : join(base, rawPath);
  if (existsSync(target)) throw new Error(`target already exists: ${target}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return { type, path: target };
}
