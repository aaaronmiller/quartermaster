import type { Repository } from "../storage/repository";
import { queryArtifacts } from "../query/commands";

export function renderTuiState(repo: Repository): unknown {
  return {
    title: "Quartermaster",
    catalog: queryArtifacts(repo)
  };
}
