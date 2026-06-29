// ─────────────────────────────────────────────────────────────
// Quartermaster — Compatibility Verdict Auditor
// Pure functions computing verdicts for (artifact, harness) pairs.
// ─────────────────────────────────────────────────────────────

import type { Artifact, HarnessProfile } from '@core/types';
import type { Repository } from '@storage/repository';
import { TransformRegistry } from './transforms';

export type VerdictStatus = 'deployable' | 'incompatible' | 'transform';

export interface VerdictResult {
  artifactId: string;
  harness: string;
  verdict: VerdictStatus;
  reason: string;
  transformation?: string;
}

export interface VerdictOverride {
  status: VerdictStatus;
  note: string;
}

export interface VerdictOverrideRecord extends VerdictOverride {
  artifactId: string;
  harness: string;
}

/**
 * Compute a single compatibility verdict for an artifact/harness pair.
 * Pure function: no side effects, deterministic output for same inputs.
 */
export function computeVerdict(
  artifact: Artifact,
  profile: HarnessProfile,
  overrides?: Map<string, Map<string, VerdictOverride>>,
): VerdictResult {
  // Check manual overrides first
  if (overrides) {
    const artifactOverrides = overrides.get(artifact.id);
    if (artifactOverrides) {
      const override = artifactOverrides.get(profile.id);
      if (override) {
        return {
          artifactId: artifact.id,
          harness: profile.id,
          verdict: override.status,
          reason: `manual override: ${override.note}`,
        };
      }
    }
  }

  // 1. Type support check
  const typeLocation = profile.artifactTypes.find((at) => at.type === artifact.type);
  if (!typeLocation) {
    return {
      artifactId: artifact.id,
      harness: profile.id,
      verdict: 'incompatible',
      reason: `type '${artifact.type}' not supported by harness '${profile.id}'`,
    };
  }

  // 2. Capability support check
  const transforms = new TransformRegistry();
  for (const cap of artifact.capabilities) {
    const support = profile.capabilities.find((c) => c.type === cap.type);
    if (!support) {
      return {
        artifactId: artifact.id,
        harness: profile.id,
        verdict: 'incompatible',
        reason: `capability '${cap.type}' not supported by harness '${profile.id}'`,
      };
    }

    // 3. Dialect match check
    if (cap.dialect && support.dialects.length > 0) {
      if (!support.dialects.includes(cap.dialect)) {
        const transform = transforms.findTransform(artifact.type, cap.dialect, support.dialects[0] ?? '');
        if (transform) {
          return {
            artifactId: artifact.id,
            harness: profile.id,
            verdict: 'transform',
            reason: `dialect '${cap.dialect}' for capability '${cap.type}' requires transform '${transform.name}'`,
            transformation: transform.name,
          };
        }
        return {
          artifactId: artifact.id,
          harness: profile.id,
          verdict: 'incompatible',
          reason: `dialect '${cap.dialect}' for capability '${cap.type}' is not supported by harness '${profile.id}'`,
        };
      }
    }
  }

  // 4. Config format translation check
  const sourceConfigFormat = artifact.metadata?.configFormat as string | undefined;
  if (
    artifact.type === 'mcp-config' &&
    sourceConfigFormat &&
    typeLocation.configFormat &&
    sourceConfigFormat !== typeLocation.configFormat
  ) {
    return {
      artifactId: artifact.id,
      harness: profile.id,
      verdict: 'transform',
      reason: `config format '${sourceConfigFormat}' must be translated to '${typeLocation.configFormat}'`,
      transformation: 'config-translate',
    };
  }

  // 5. Flatten check
  if (typeLocation.flat && artifact.organizationalPath !== '.') {
    return {
      artifactId: artifact.id,
      harness: profile.id,
      verdict: 'transform',
      reason: 'harness requires flat layout, artifact has nested path',
      transformation: 'flatten',
    };
  }

  // 6. All checks passed
  return {
    artifactId: artifact.id,
    harness: profile.id,
    verdict: 'deployable',
    reason: 'artifact is compatible with harness',
  };
}

/**
 * Compute a compatibility matrix for all (artifact × profile) pairs.
 */
export function computeCompatibilityMatrix(
  artifacts: Artifact[],
  profiles: HarnessProfile[],
  overrides?: Map<string, Map<string, VerdictOverride>>,
): VerdictResult[][] {
  if (artifacts.length === 0 || profiles.length === 0) return [];

  return artifacts.map((artifact) =>
    profiles.map((profile) => computeVerdict(artifact, profile, overrides)),
  );
}

/**
 * Summarize the matrix giving counts per verdict status.
 */
export function summarizeMatrix(matrix: VerdictResult[][]): {
  deployable: number;
  incompatible: number;
  transform: number;
  total: number;
} {
  let deployable = 0;
  let incompatible = 0;
  let transform = 0;

  for (const row of matrix) {
    for (const cell of row) {
      if (cell.verdict === 'deployable') deployable++;
      else if (cell.verdict === 'incompatible') incompatible++;
      else if (cell.verdict === 'transform') transform++;
    }
  }

  return {
    deployable,
    incompatible,
    transform,
    total: deployable + incompatible + transform,
  };
}

export function saveVerdictOverride(repo: Repository, record: VerdictOverrideRecord): void {
  repo.db
    .prepare(
      `INSERT INTO verdict_overrides (artifactId, harness, status, note, updatedAt)
       VALUES ($artifactId, $harness, $status, $note, $updatedAt)
       ON CONFLICT(artifactId, harness) DO UPDATE SET
         status = $status, note = $note, updatedAt = $updatedAt`,
    )
    .run(record.artifactId, record.harness, record.status, record.note, new Date().toISOString());
}

export function loadVerdictOverrides(repo: Repository): Map<string, Map<string, VerdictOverride>> {
  const rows = repo.db
    .prepare('SELECT artifactId, harness, status, note FROM verdict_overrides')
    .all() as Array<{ artifactId: string; harness: string; status: VerdictStatus; note: string }>;
  const overrides = new Map<string, Map<string, VerdictOverride>>();
  for (const row of rows) {
    if (!overrides.has(row.artifactId)) overrides.set(row.artifactId, new Map());
    overrides.get(row.artifactId)!.set(row.harness, { status: row.status, note: row.note });
  }
  return overrides;
}
