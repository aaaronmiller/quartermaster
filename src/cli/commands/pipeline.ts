import { addPipelineToLoadout, createPipeline, validatePipeline } from "../../core/loadouts/pipelines";
import { fail, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function pipelineCommand(repo: Repository, args: string[]): void {
  const sub = args[0] ?? "list";
  if (sub === "new" || sub === "create") {
    const name = args[1] ?? fail("qm pipeline new requires name");
    const members = valuesAfter(args, "--member");
    const useCase = valueAfter(args, "--use-case") ?? name;
    const directive = valueAfter(args, "--directive") ?? `Use the ${name} pipeline for ${useCase}.`;
    printJson({ pipeline: createPipeline(repo, { name, use_case: useCase, directive, origin: "hand", members }) });
    return;
  }
  if (sub === "validate") {
    const name = args[1] ?? fail("qm pipeline validate requires pipeline name");
    printJson(validatePipeline(repo, name));
    return;
  }
  if (sub === "add-to") {
    const loadout = args[1] ?? fail("qm pipeline add-to requires loadout name");
    const pipeline = args[2] ?? fail("qm pipeline add-to requires pipeline name");
    printJson({ loadout: addPipelineToLoadout(repo, loadout, pipeline) });
    return;
  }
  const pipelines = repo.listPipelines();
  if (args.includes("--json")) printJson({ pipelines });
  else printText(pipelines.map((pipeline) => `${pipeline.name}\t${pipeline.members.length}\t${pipeline.use_case}`));
}

function valueAfter(args: string[], flag: string): string | null {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] ?? null : null;
}

function valuesAfter(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}
