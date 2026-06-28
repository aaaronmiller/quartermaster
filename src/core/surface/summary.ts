import type { Repository } from "../../storage/repository";
import type { Artifact, ArtifactType, EvaluationProposal } from "../types";

export interface SurfaceSummary {
  catalog: {
    total: number;
    by_type: Record<string, number>;
    risky: number;
    locally_modified: number;
    sources: number;
  };
  compatibility: {
    total: number;
    deployable: number;
    transform: number;
    incompatible: number;
    by_harness: Record<string, { deployable: number; transform: number; incompatible: number }>;
  };
  loadouts: { total: number; names: string[] };
  activation: {
    total: number;
    active: number;
    by_harness: Record<string, { loadout_id: string; loadout_name: string; active: boolean; members: number }>;
  };
  pipelines: { total: number; names: string[] };
  proposals: {
    total: number;
    pending: number;
    accepted: number;
    rejected: number;
    by_kind: Record<string, number>;
  };
  deployments: {
    total: number;
    latest: { id: string; harness_id: string; applied_at: string; operations: number } | null;
  };
  recommendations: string[];
}

export interface ArtifactSearchInput {
  text?: string;
  type?: ArtifactType;
  capability?: string;
  risk?: string;
  source_id?: string;
  org_path?: string;
}

export function buildSurfaceSummary(repo: Repository): SurfaceSummary {
  const artifacts = repo.listArtifacts();
  const verdicts = repo.listVerdicts();
  const loadouts = repo.listLoadouts();
  const assignments = repo.listLoadoutAssignments();
  const pipelines = repo.listPipelines();
  const proposals = repo.listProposals();
  const deployments = repo.listDeployments();

  const byHarness: SurfaceSummary["compatibility"]["by_harness"] = {};
  for (const verdict of verdicts) {
    byHarness[verdict.harness_id] ??= { deployable: 0, transform: 0, incompatible: 0 };
    byHarness[verdict.harness_id]![verdict.result] += 1;
  }

  const latest = deployments[0] ?? null;
  const summary: SurfaceSummary = {
    catalog: {
      total: artifacts.length,
      by_type: countBy(artifacts, (artifact) => artifact.type),
      risky: artifacts.filter((artifact) => artifact.risk_flags.length > 0).length,
      locally_modified: artifacts.filter((artifact) => artifact.locally_modified).length,
      sources: repo.listSources().length
    },
    compatibility: {
      total: verdicts.length,
      deployable: verdicts.filter((verdict) => verdict.result === "deployable").length,
      transform: verdicts.filter((verdict) => verdict.result === "transform").length,
      incompatible: verdicts.filter((verdict) => verdict.result === "incompatible").length,
      by_harness: byHarness
    },
    loadouts: { total: loadouts.length, names: loadouts.map((loadout) => loadout.name) },
    activation: {
      total: assignments.length,
      active: assignments.filter((assignment) => assignment.active).length,
      by_harness: Object.fromEntries(
        assignments.map((assignment) => {
          const loadout = repo.getLoadout(assignment.loadout_id);
          return [
            assignment.harness_id,
            {
              loadout_id: assignment.loadout_id,
              loadout_name: loadout?.name ?? assignment.loadout_id,
              active: assignment.active,
              members: loadout?.members.length ?? 0
            }
          ] as const;
        })
      )
    },
    pipelines: { total: pipelines.length, names: pipelines.map((pipeline) => pipeline.name) },
    proposals: {
      total: proposals.length,
      ...proposalStatusCounts(proposals),
      by_kind: countBy(proposals, (proposal) => proposal.kind)
    },
    deployments: {
      total: deployments.length,
      latest: latest
        ? {
            id: latest.id,
            harness_id: latest.harness_id,
            applied_at: latest.applied_at,
            operations: latest.operations.length
          }
        : null
    },
    recommendations: []
  };

  summary.recommendations = buildRecommendations(summary);
  return summary;
}

export function searchArtifacts(repo: Repository, input: ArtifactSearchInput): Artifact[] {
  const text = input.text?.trim().toLowerCase();
  const filters: Parameters<Repository["listArtifacts"]>[0] = {};
  if (input.type) filters.type = input.type;
  if (input.source_id) filters.source_id = input.source_id;
  if (input.org_path) filters.org_path = input.org_path;
  return repo.listArtifacts(filters).filter((artifact) => {
    if (input.capability && !artifact.required_capabilities.some((capability) => capability.name === input.capability || capability.dialect === input.capability)) {
      return false;
    }
    if (input.risk && !artifact.risk_flags.includes(input.risk)) return false;
    if (text) {
      const capabilities = artifact.required_capabilities.map((capability) => `${capability.name} ${capability.dialect ?? ""}`).join(" ");
      const haystack = `${artifact.name} ${artifact.description ?? ""} ${artifact.org_path} ${artifact.type} ${capabilities} ${artifact.risk_flags.join(" ")}`.toLowerCase();
      if (!haystack.includes(text)) return false;
    }
    return true;
  });
}

function countBy<T>(items: T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const value = key(item);
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function proposalStatusCounts(proposals: EvaluationProposal[]): { pending: number; accepted: number; rejected: number } {
  return {
    pending: proposals.filter((proposal) => proposal.accepted === null).length,
    accepted: proposals.filter((proposal) => proposal.accepted === true).length,
    rejected: proposals.filter((proposal) => proposal.accepted === false).length
  };
}

function buildRecommendations(summary: SurfaceSummary): string[] {
  const recommendations: string[] = [];
  if (summary.catalog.total === 0) recommendations.push("Run qm scan --root <library> to catalog artifacts.");
  if (summary.compatibility.total === 0 && summary.catalog.total > 0) recommendations.push("Run qm audit to compute harness compatibility before deployment.");
  if (summary.catalog.risky > 0) recommendations.push("Review risk flags and run qm safety scan before deployment.");
  if (summary.compatibility.incompatible > 0) recommendations.push("Inspect incompatible verdicts before assigning broad loadouts.");
  if (summary.loadouts.total === 0 && summary.catalog.total > 0) recommendations.push("Create focused loadouts so harnesses do not see the full library at once.");
  if (summary.activation.total === 0 && summary.loadouts.total > 0) recommendations.push("Assign loadouts to harnesses so each CLI sees only the skills it needs.");
  if (summary.pipelines.total === 0 && summary.catalog.total > 1) recommendations.push("Define or propose pipelines for recurring multi-skill workflows.");
  if (summary.proposals.pending > 0) recommendations.push("Review pending agentic proposals before using them in loadouts or guidance.");
  return recommendations;
}
