import type { EvaluationProposal } from "../types";
import type { Repository } from "../../storage/repository";
import { createLoadout } from "../loadouts/loadouts";
import { createPipeline } from "../loadouts/pipelines";

export function acceptProposal(repo: Repository, id: string): { proposal: EvaluationProposal; applied: unknown } {
  const proposal = repo.getProposal(id);
  if (!proposal) throw new Error(`Proposal not found: ${id}`);
  const updated = { ...proposal, accepted: true };
  repo.saveProposal(updated);
  return { proposal: updated, applied: materializeAcceptedProposal(repo, updated) };
}

export function rejectProposal(repo: Repository, id: string): EvaluationProposal {
  const proposal = repo.getProposal(id);
  if (!proposal) throw new Error(`Proposal not found: ${id}`);
  const updated = { ...proposal, accepted: false };
  repo.saveProposal(updated);
  return updated;
}

function materializeAcceptedProposal(repo: Repository, proposal: EvaluationProposal): unknown {
  const payload = proposal.payload;
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  if (proposal.kind === "loadout" && typeof data.name === "string") {
    const members = stringArray(data.members);
    return { loadout: createLoadout(repo, data.name, members, typeof data.description === "string" ? data.description : proposal.rationale) };
  }
  if (proposal.kind === "pipeline" && typeof data.name === "string") {
    return {
      pipeline: createPipeline(repo, {
        name: data.name,
        use_case: typeof data.use_case === "string" ? data.use_case : data.name,
        directive: typeof data.directive === "string" ? data.directive : proposal.rationale,
        origin: "agentic",
        members: stringArray(data.members)
      })
    };
  }
  if (proposal.kind === "fix") {
    const artifactId = typeof data.artifact_id === "string" ? data.artifact_id : stringArray(data.artifact_ids)[0];
    if (!artifactId) return null;
    const artifact = repo.getArtifact(artifactId);
    if (!artifact) return null;
    const parsed = data.parsed && typeof data.parsed === "object" ? data.parsed as Record<string, unknown> : {};
    const improved = typeof parsed.improved_content === "string" ? parsed.improved_content : null;
    if (!improved) return { skipped: "accepted fix proposal did not include improved_content" };
    const path = artifact.abs_path.endsWith("/SKILL.md") ? artifact.abs_path : `${artifact.abs_path}/SKILL.md`;
    Bun.write(path, improved.endsWith("\n") ? improved : `${improved}\n`);
    return { fixed_artifact_id: artifact.id, path };
  }
  return null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
