// ─────────────────────────────────────────────────────────────
// Quartermaster — Auto-audit on ingest (FR-141)
// Newly imported or newly authored artifacts are scanned for risk
// indicators automatically; normalized findings are persisted so the
// deploy-time safety gate can act on them.
// ─────────────────────────────────────────────────────────────

import type { Artifact, RiskFlag, SafetyFinding } from '@core/types';
import { scanRisks } from '@core/risk/scanner';
import type { Repository } from '@storage/repository';
import { computeSafetyScore } from './findings';

/** Convert a deterministic risk flag into a normalized safety finding. */
export function riskFlagToFinding(flag: RiskFlag): SafetyFinding {
  return {
    severity: flag.severity,
    source: 'risk-scanner',
    artifactId: flag.artifactId,
    description: `${flag.type}: ${flag.detail}`,
    recommendation: 'Review before deploying; record an override if intended.',
  };
}

/**
 * Run the built-in risk scanner against an artifact, persist normalized
 * findings + risk flags, and return the computed safety score. Called
 * automatically after import and after a self-authored artifact is cataloged.
 */
export async function auditOnIngest(repo: Repository, artifact: Artifact, at: string): Promise<number> {
  const riskFlags = await scanRisks(artifact);
  const findings = riskFlags.map(riskFlagToFinding);
  repo.saveFindings(artifact.id, findings, at);
  if (riskFlags.length > 0) repo.upsertArtifact({ ...artifact, riskFlags });
  return computeSafetyScore(findings);
}
