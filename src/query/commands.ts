import type { Repository } from "../storage/repository";
import { buildSurfaceSummary, searchArtifacts, type ArtifactSearchInput } from "../core/surface/summary";
import { resolveLoadoutArtifacts } from "../core/loadouts/loadouts";

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

export function querySummary(repo: Repository): unknown {
  return buildSurfaceSummary(repo);
}

export function queryArtifactSearch(repo: Repository, input: ArtifactSearchInput): unknown {
  return {
    query: input,
    artifacts: searchArtifacts(repo, input).map((artifact) => ({
      id: artifact.id,
      type: artifact.type,
      name: artifact.name,
      description: artifact.description,
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
  const assignment = repo.getLoadoutAssignment(harnessId);
  const loadout = assignment ? repo.getLoadout(assignment.loadout_id) : null;
  const activeArtifacts = assignment && assignment.active && loadout ? resolveLoadoutArtifacts(repo, loadout).map((artifact) => artifact.id) : [];
  return {
    harness_id: harnessId,
    active_loadout: assignment && assignment.active ? loadout?.name ?? assignment.loadout_id : null,
    assignment: assignment
      ? {
          loadout_id: assignment.loadout_id,
          active: assignment.active,
          assigned_at: assignment.assigned_at
        }
      : null,
    deployed_artifacts: activeArtifacts,
    drift: [],
    orphans: []
  };
}

export function queryLoadouts(repo: Repository): unknown {
  return {
    loadouts: repo.listLoadouts(),
    assignments: repo.listLoadoutAssignments()
  };
}

export function queryPipelines(repo: Repository): unknown {
  return { pipelines: repo.listPipelines() };
}

export function queryProposals(repo: Repository): unknown {
  return { proposals: repo.listProposals() };
}
