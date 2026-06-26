import { scanLibrary } from "../../core/catalog/scanner";
import { argValue, fail, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export async function scanCommand(repo: Repository, args: string[]): Promise<void> {
  const root = argValue(args, "--root");
  if (!root) fail("qm scan requires --root <path>");
  const result = await scanLibrary(repo, root);
  if (args.includes("--json")) printJson(result);
  else printText(`Scanned ${result.root}: ${result.added} added, ${result.changed} changed, ${result.removed} removed, ${result.unchanged} unchanged`);
}
