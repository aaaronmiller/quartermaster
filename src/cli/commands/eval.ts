import { createDeterministicProposal, createSkillReviewProposal } from "../../core/evaluation/workflows";
import { fail, printJson } from "../output";
import type { Repository } from "../../storage/repository";

export async function evalCommand(repo: Repository, args: string[]): Promise<void> {
  const requested = args[0];
  const kind = normalizeKind(requested);
  if (!kind || !["grade", "comparison", "loadout", "pipeline", "audit", "improvement", "fix"].includes(kind)) fail("qm eval requires grade, comparison, loadout, pipeline, audit, improvement, or fix");
  if (kind === "audit" || kind === "improvement" || kind === "fix") {
    const artifactIds = args.slice(1).filter((arg) => !arg.startsWith("--"));
    const instruction = valueAfter(args, "--instruction");
    const model = valueAfter(args, "--model");
    const proposal = await createSkillReviewProposal(repo, {
      artifactIds,
      mode: kind,
      ...(instruction ? { instruction } : {}),
      ...(model ? { model } : {})
    });
    printJson({ proposal });
    return;
  }
  const proposal = createDeterministicProposal(repo, kind, { args: args.slice(1) }, "Stored as an advisory proposal; no deterministic state was changed.");
  printJson({ proposal });
}

function normalizeKind(value: string | undefined): "grade" | "comparison" | "loadout" | "pipeline" | "audit" | "improvement" | "fix" | undefined {
  if (value === "compare") return "comparison";
  if (value === "propose-loadouts") return "loadout";
  if (value === "build-pipelines" || value === "propose-pipeline") return "pipeline";
  if (value === "improve") return "improvement";
  return value as "grade" | "comparison" | "loadout" | "pipeline" | "audit" | "improvement" | "fix" | undefined;
}

function valueAfter(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}
