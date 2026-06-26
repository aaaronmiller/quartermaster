import { renderGuidance } from "../../core/guidance/render";
import { printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function guidanceCommand(repo: Repository, args: string[]): void {
  const rendered = renderGuidance("", repo.listPipelines());
  if (args.includes("--json")) printJson({ guidance: rendered });
  else printText(rendered);
}
