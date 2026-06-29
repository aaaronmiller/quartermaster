// ─────────────────────────────────────────────────────────────
// Quartermaster — Deployment Plan Compiler
// Produces per-harness deployment plans from artifact +
// verdict pairs, with scope, flatten, and transform support.
// ─────────────────────────────────────────────────────────────

import type { VerdictResult } from '@core/audit/auditor';
import type { Artifact, DeploymentOperation, DeploymentPlan, HarnessProfile } from '@core/types';

export interface PlanOptions {
  scope?: Artifact[];
  libraryRoot?: string;
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
    if (scope && !scope.some((s) => s.id === artifact.id)) continue;

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
      sourcePath: artifact.path,
      targetPath,
      method: profile.deployment.method,
    };

    if (verdict.verdict === 'transform' && verdict.transformation) {
      operation.transform = verdict.transformation;
    }

    operations.push(operation);
  }

  return {
    harness: profile.name,
    operations,
    excluded,
  };
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
