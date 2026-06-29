// ─────────────────────────────────────────────────────────────
// Quartermaster — Deployment Plan Compiler
// Produces per-harness deployment plans from artifact +
// verdict pairs, with scope, flatten, and transform support.
// ─────────────────────────────────────────────────────────────

import type { VerdictResult } from '@core/audit/auditor';
import type { Artifact, DeploymentOperation, DeploymentPlan, HarnessProfile } from '@core/types';

export interface PlanOptions {
  scope?: Artifact[] | PlanScope;
  libraryRoot?: string;
  /** Safety gate (FR-141): block artifacts below threshold unless overridden/allowlisted. */
  safety?: PlanSafetyGate;
}

export interface PlanSafetyGate {
  /** Minimum safety score in [0, 1] required to deploy. */
  threshold: number;
  /** artifactId → computed safety score (absent = treated as fully safe, 1.0). */
  scores: Record<string, number>;
  /** artifactIds with a recorded developer override (deploy despite low score). */
  overrides?: ReadonlySet<string>;
  /** artifactIds exempt from gating via the trusted allowlist. */
  allowlisted?: ReadonlySet<string>;
}

export interface PlanScope {
  ids?: string[];
  orgPath?: string;
  tags?: string[];
}

/**
 * Compile a deployment plan for a single harness.
 */
export function compilePlan(
  artifacts: Artifact[],
  verdicts: VerdictResult[],
  profile: HarnessProfile,
  options?: PlanOptions,
): DeploymentPlan {
  const scope = options?.scope;
  const verdictMap = new Map<string, VerdictResult>();
  for (const v of verdicts) {
    verdictMap.set(v.artifactId, v);
  }

  const operations: DeploymentOperation[] = [];
  const excluded: Array<{ artifact: string; reason: string }> = [];

  for (const artifact of artifacts) {
    // Apply scope filter
    if (scope && !artifactInScope(artifact, scope)) continue;

    const verdict = verdictMap.get(artifact.id);
    if (!verdict) {
      excluded.push({
        artifact: artifact.id,
        reason: 'no verdict computed (run audit first)',
      });
      continue;
    }

    if (verdict.verdict === 'incompatible') {
      excluded.push({ artifact: artifact.id, reason: verdict.reason });
      continue;
    }

    // FR-141: safety threshold gate. Below-threshold artifacts are excluded
    // unless allowlisted or covered by a recorded developer override.
    const gate = options?.safety;
    if (gate) {
      const score = gate.scores[artifact.id] ?? 1;
      const exempt = gate.allowlisted?.has(artifact.id) || gate.overrides?.has(artifact.id);
      if (!exempt && score < gate.threshold) {
        excluded.push({
          artifact: artifact.id,
          reason: `safety score ${score.toFixed(2)} below threshold ${gate.threshold.toFixed(2)} (record an override to deploy)`,
        });
        continue;
      }
    }

    // Resolve target path from profile
    const typeLocation = profile.artifactTypes.find((at) => at.type === artifact.type);
    if (!typeLocation) {
      excluded.push({
        artifact: artifact.id,
        reason: `type '${artifact.type}' has no location in profile`,
      });
      continue;
    }

    const targetDir = typeLocation.locations.project || typeLocation.locations.global;
    const targetName = artifact.path.split('/').pop() ?? artifact.id;
    const targetPath = `${targetDir}/${targetName}`;

    const operation: DeploymentOperation = {
      artifactId: artifact.id,
      sourcePath: artifact.path,
      targetPath,
      method: profile.deployment.method,
      provenance: artifact.provenance,
      ...(artifact.riskFlags && artifact.riskFlags.length > 0 ? { riskFlags: artifact.riskFlags } : {}),
    };

    if (verdict.verdict === 'transform' && verdict.transformation) {
      operation.transform = verdict.transformation;
    }

    operations.push(operation);
  }

  return {
    harness: profile.id,
    operations,
    excluded,
  };
}

function artifactInScope(artifact: Artifact, scope: Artifact[] | PlanScope): boolean {
  if (Array.isArray(scope)) return scope.some((s) => s.id === artifact.id);
  if (scope.ids && !scope.ids.includes(artifact.id) && !scope.ids.includes(artifact.name)) return false;
  if (scope.orgPath && !artifact.organizationalPath.startsWith(scope.orgPath)) return false;
  if (scope.tags && scope.tags.length > 0) {
    const tags = artifact.metadata.tags;
    const tagList = Array.isArray(tags) ? tags.map(String) : [];
    if (!scope.tags.some((tag) => tagList.includes(tag))) return false;
  }
  return true;
}

/**
 * Compile deployment plans for multiple harnesses.
 */
export function compileMultiHarnessPlan(
  artifacts: Artifact[],
  verdictsByHarness: Map<string, VerdictResult[]>,
  profiles: Map<string, HarnessProfile>,
  options?: PlanOptions,
): Map<string, DeploymentPlan> {
  const plans = new Map<string, DeploymentPlan>();

  for (const [harnessName, verdicts] of verdictsByHarness) {
    const profile = profiles.get(harnessName);
    if (!profile) throw new DeployError(`Harness profile '${harnessName}' not found`);

    plans.set(harnessName, compilePlan(artifacts, verdicts, profile, options));
  }

  return plans;
}

export class DeployError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeployError';
  }
}
