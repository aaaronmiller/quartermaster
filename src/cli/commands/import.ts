import { importSource } from "../../core/catalog/importers";
import { argValue, fail, printJson } from "../output";
import type { Repository } from "../../storage/repository";
import type { SourceKind } from "../../core/types";

export function importCommand(repo: Repository, args: string[]): void {
  const kind = (argValue(args, "--kind") ?? "local") as SourceKind;
  const reference = argValue(args, "--source") ?? fail("qm import requires --source <path-or-url>");
  const destinationRoot = argValue(args, "--dest") ?? ".quartermaster/imports";
  printJson({ source: importSource(repo, { kind, reference, destinationRoot }) });
}
