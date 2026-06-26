import { createDeterministicProposal } from "../../core/evaluation/workflows";
import { fail, printJson } from "../output";
import type { Repository } from "../../storage/repository";

export function evalCommand(repo: Repository, args: string[]): void {
  const kind = args[0] as "grade" | "comparison" | "loadout" | "pipeline" | undefined;
  if (!kind || !["grade", "comparison", "loadout", "pipeline"].includes(kind)) fail("qm eval requires grade, comparison, loadout, or pipeline");
  const proposal = createDeterministicProposal(repo, kind, { args: args.slice(1) }, "Stored as an advisory proposal; no deterministic state was changed.");
  printJson({ proposal });
}
