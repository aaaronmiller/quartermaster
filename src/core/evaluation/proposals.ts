import { nowIso, stableId, type EvaluationProposal } from "../types";
import type { Repository } from "../../storage/repository";

export function saveProposal(repo: Repository, input: Omit<EvaluationProposal, "id" | "created_at" | "accepted">): EvaluationProposal {
  const proposal: EvaluationProposal = { ...input, id: stableId("proposal", input.kind, input.rationale, nowIso()), accepted: null, created_at: nowIso() };
  repo.saveProposal(proposal);
  return proposal;
}

export function setProposalAccepted(proposal: EvaluationProposal, accepted: boolean): EvaluationProposal {
  return { ...proposal, accepted };
}
