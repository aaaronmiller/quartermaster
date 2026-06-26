import type { Repository } from "../storage/repository";

export function queryArtifacts(repo: Repository): unknown {
  return {
    artifacts: repo.listArtifacts().map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      name: artifact.name,
      org_path: artifact.org_path,
      required_capabilities: artifact.required_capabilities,
      risk_flags: artifact.risk_flags,
      source_id: artifact.source_id
    }))
  };
}

export function queryCompatibility(repo: Repository, artifactId: string): unknown {
  return { artifact_id: artifactId, verdicts: repo.listVerdicts(artifactId).map(({ computed_at, ...verdict }) => verdict) };
}

export function queryDeployment(repo: Repository, harnessId: string): unknown {
  return {
    harness_id: harnessId,
    active_loadout: null,
    deployed_artifacts: repo.listDeployments(harnessId).flatMap((record) => record.operations.map((op) => op.artifact_id).filter(Boolean)),
    drift: [],
    orphans: []
  };
}
