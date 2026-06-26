import { checkUpstream } from "../../core/catalog/sync";
import { printJson } from "../output";
import type { Repository } from "../../storage/repository";

export function syncCommand(repo: Repository): void {
  printJson({ sources: checkUpstream(repo) });
}
