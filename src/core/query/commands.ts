// ─────────────────────────────────────────────────────────────
// Quartermaster — Agent Query Interface (FR-130, FR-131)
// Stable machine-readable output for agentic consumers.
// ─────────────────────────────────────────────────────────────

import { Repository } from '@storage/repository';
import type { Artifact, ArtifactType, HarnessProfile } from '@core/types';
import { computeVerdict } from '@core/audit/auditor';
import { ProfileRegistry } from '@core/profiles/profile-registry';
import { loadConfig } from '@core/config/load';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

export interface QueryArtifactResult {
  id: string;
  type: string;
  name: string;
  org_path: string;
  required_capabilities: string[];
  risk_flags: unknown[];
  source_id: string;
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
export function queryArtifacts(repo: Repository): { artifacts: QueryArtifactResult[] } {
  const artifacts = repo.listArtifacts();
  return {
    artifacts: artifacts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      org_path: a.organizationalPath,
      required_capabilities: a.capabilities.map((c) => c.type),
      risk_flags: a.riskFlags ?? [],
      source_id: a.source.kind,
    })),
  };
}

/** Get a single artifact by ID. */
export function queryArtifact(repo: Repository, id: string): QueryArtifactResult | null {
  const artifact = repo.getArtifact(id);
  if (!artifact) return null;
  return {
    id: artifact.id,
    type: artifact.type,
    name: artifact.name,
    org_path: artifact.organizationalPath,
    required_capabilities: artifact.capabilities.map((c) => c.type),
    risk_flags: artifact.riskFlags ?? [],
    source_id: artifact.source.kind,
  };
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

  return {
    artifacts: artifacts.map((a) => ({
      id: a.id,
      type: a.type,
      name: a.name,
      org_path: a.organizationalPath,
      required_capabilities: a.capabilities.map((c) => c.type),
      risk_flags: a.riskFlags ?? [],
      source_id: a.source.kind,
    })),
  };
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
  if (content === null) throw new Error(`unsupported artifact type: ${type}`);
  const base = root ?? loadConfig().roots[0] ?? process.cwd();
  const target = isAbsolute(rawPath) ? rawPath : join(base, rawPath);
  if (existsSync(target)) throw new Error(`target already exists: ${target}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
  return { type, path: target };
}
