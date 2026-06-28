import { nowIso, stableId, type Pipeline } from "../types";
import type { Repository } from "../../storage/repository";
import { addLoadoutMember } from "./loadouts";

export function createPipeline(repo: Repository, input: Omit<Pipeline, "id" | "updated_at">): Pipeline {
  const pipeline: Pipeline = { ...input, id: stableId("pipeline", input.name), updated_at: nowIso() };
  repo.savePipeline(pipeline);
  return pipeline;
}

export function validatePipeline(repo: Repository, nameOrId: string): { valid: boolean; missing: string[]; pipeline: Pipeline | null } {
  const pipeline = repo.getPipeline(nameOrId);
  if (!pipeline) return { valid: false, missing: [nameOrId], pipeline: null };
  const missing = pipeline.members.filter((artifactId) => !repo.getArtifact(artifactId));
  return { valid: missing.length === 0, missing, pipeline };
}

export function addPipelineToLoadout(repo: Repository, loadoutNameOrId: string, pipelineNameOrId: string) {
  const pipeline = repo.getPipeline(pipelineNameOrId);
  if (!pipeline) throw new Error(`Pipeline not found: ${pipelineNameOrId}`);
  return addLoadoutMember(repo, loadoutNameOrId, pipeline.id);
}
