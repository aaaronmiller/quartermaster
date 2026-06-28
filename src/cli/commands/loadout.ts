import { assignLoadout, addLoadoutMember, copyLoadoutAssignment, createLoadout, removeLoadoutMember, resolveLoadoutArtifacts, switchLoadout, updateLoadoutMembers } from "../../core/loadouts/loadouts";
import { loadBuiltInProfiles } from "../../core/audit/profile-registry";
import { argValue, fail, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function loadoutCommand(repo: Repository, args: string[]): void {
  const sub = args[0] ?? "list";
  if (sub === "create" || sub === "new") {
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
  if (sub === "remove") {
    const name = args[1] ?? fail("qm loadout remove requires loadout name");
    const artifact = args[2] ?? fail("qm loadout remove requires member id");
    printJson({ loadout: removeLoadoutMember(repo, name, artifact) });
    return;
  }
  if (sub === "set") {
    const name = args[1] ?? fail("qm loadout set requires loadout name");
    const members = valuesAfter(args, "--member");
    printJson({ loadout: updateLoadoutMembers(repo, name, members, argValue(args, "--description")) });
    return;
  }
  if (sub === "assign") {
    const name = args[1] ?? fail("qm loadout assign requires loadout name");
    const harness = argValue(args, "--harness") ?? args[2] ?? fail("qm loadout assign requires --harness <id>");
    const active = !args.includes("--inactive");
    printJson({ assignment: assignLoadout(repo, harness, name, active) });
    return;
  }
  if (sub === "switch") {
    const harness = args[1] ?? fail("qm loadout switch requires harness id");
    const name = args[2] ?? fail("qm loadout switch requires loadout name");
    printJson({ assignment: switchLoadout(repo, harness, name) });
    return;
  }
  if (sub === "copy" || sub === "move") {
    const from = args[2] ?? fail(`qm loadout ${sub} requires from-harness`);
    const to = args[3] ?? fail(`qm loadout ${sub} requires to-harness`);
    printJson({ assignment: copyLoadoutAssignment(repo, from, to, sub === "move") });
    return;
  }
  if (sub === "show") {
    const name = args[1] ?? fail("qm loadout show requires loadout name");
    const loadout = repo.getLoadout(name) ?? fail(`Loadout not found: ${name}`);
    const assignments = repo.listLoadoutAssignments().filter((assignment) => assignment.loadout_id === loadout.id);
    const activeArtifacts = resolveLoadoutArtifacts(repo, loadout);
    if (args.includes("--json")) printJson({ loadout, assignments, active_artifacts: activeArtifacts });
    else {
      printText([
        `${loadout.name}\t${loadout.members.length}`,
        loadout.description ?? "",
        ...assignments.map((assignment) => `${assignment.harness_id}\t${assignment.active ? "active" : "inactive"}`)
      ]);
    }
    return;
  }
  const loadouts = repo.listLoadouts();
  const assignments = repo.listLoadoutAssignments();
  if (args.includes("--json")) printJson({ loadouts, assignments });
  else {
    const harnessMap = new Map(assignments.map((assignment) => [assignment.harness_id, assignment]));
    const profiles = loadBuiltInProfiles();
    printText([
      ...loadouts.map((loadout) => `${loadout.name}\t${loadout.members.length}`),
      "",
      ...profiles.map((profile) => {
        const assignment = harnessMap.get(profile.id);
        const label = assignment ? `${assignment.active ? "active" : "inactive"}:${assignment.loadout_id}` : "unassigned";
        return `${profile.id}\t${label}`;
      })
    ]);
  }
}

function valuesAfter(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag && args[index + 1]) values.push(args[index + 1]!);
  }
  return values;
}
