import { addLoadoutMember, createLoadout } from "../../core/loadouts/loadouts";
import { argValue, fail, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function loadoutCommand(repo: Repository, args: string[]): void {
  const sub = args[0] ?? "list";
  if (sub === "create") {
    const name = args[1] ?? fail("qm loadout create requires name");
    const loadout = createLoadout(repo, name, [], argValue(args, "--description"));
    printJson({ loadout });
    return;
  }
  if (sub === "add") {
    const name = args[1] ?? fail("qm loadout add requires loadout name");
    const artifact = args[2] ?? fail("qm loadout add requires artifact id");
    printJson({ loadout: addLoadoutMember(repo, name, artifact) });
    return;
  }
  const loadouts = repo.listLoadouts();
  if (args.includes("--json")) printJson({ loadouts });
  else printText(loadouts.map((loadout) => `${loadout.name}\t${loadout.members.length}`));
}
