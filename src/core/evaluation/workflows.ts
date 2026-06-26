import type { Repository } from "../../storage/repository";
import { saveProposal } from "./proposals";

export function createDeterministicProposal(repo: Repository, kind: "grade" | "comparison" | "loadout" | "pipeline", payload: unknown, rationale: string) {
  return saveProposal(repo, { kind, payload, rationale, model: "deterministic-local", turns: 0 });
}
