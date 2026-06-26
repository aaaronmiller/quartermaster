import { nowIso, stableId, type Pipeline } from "../types";
import type { Repository } from "../../storage/repository";

export function createPipeline(repo: Repository, input: Omit<Pipeline, "id" | "updated_at">): Pipeline {
  const pipeline: Pipeline = { ...input, id: stableId("pipeline", input.name), updated_at: nowIso() };
  repo.savePipeline(pipeline);
  return pipeline;
}
