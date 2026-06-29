// ─────────────────────────────────────────────────────────────
// Quartermaster — Compatibility Verdict Auditor
// Pure functions computing verdicts for (artifact, harness) pairs.
// ─────────────────────────────────────────────────────────────

import type { Artifact, Capability, HarnessProfile } from '@core/types';

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
      const override = artifactOverrides.get(profile.name);
      if (override) {
        return {
          artifactId: artifact.id,
          harness: profile.name,
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
      harness: profile.name,
      verdict: 'incompatible',
      reason: `type '${artifact.type}' not supported by harness '${profile.name}'`,
    };
  }

  // 2. Capability support check
  for (const cap of artifact.capabilities) {
    const support = profile.capabilities.find((c) => c.type === cap.type);
    if (!support) {
      return {
        artifactId: artifact.id,
        harness: profile.name,
        verdict: 'incompatible',
        reason: `capability '${cap.type}' not supported by harness '${profile.name}'`,
      };
    }

    // 3. Dialect match check
    if (cap.dialect && support.dialects.length > 0) {
      if (!support.dialects.includes(cap.dialect)) {
        // Check if a transform is available (handled by transform registry in production)
        return {
          artifactId: artifact.id,
          harness: profile.name,
          verdict: 'transform',
          reason: `dialect '${cap.dialect}' for capability '${cap.type}' requires transform`,
          transformation: `translate-${cap.type}-${cap.dialect}-to-${support.dialects[0] ?? 'generic'}`,
        };
      }
    }
  }

  // 4. Flatten check
  if (profile.deployment.method === 'copy' && typeLocation.flat) {
    return {
      artifactId: artifact.id,
      harness: profile.name,
      verdict: 'transform',
      reason: 'harness requires flat layout, artifact has nested path',
      transformation: 'flatten',
    };
  }

  // 5. All checks passed
  return {
    artifactId: artifact.id,
    harness: profile.name,
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
