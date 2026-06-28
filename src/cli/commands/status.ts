import { loadBuiltInProfiles } from "../../core/audit/profile-registry";
import { resolveLoadoutArtifacts } from "../../core/loadouts/loadouts";
import { printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function statusCommand(repo: Repository, args: string[]): void {
  const deployments = repo.listDeployments();
  const artifactIds = new Set(repo.listArtifacts().map((artifact) => artifact.id));
  const orphans = deployments.flatMap((record) => record.operations).filter((operation) => operation.artifact_id && !artifactIds.has(operation.artifact_id));
  const profiles = loadBuiltInProfiles();
  const assignments = repo.listLoadoutAssignments();
  const loadouts = new Map(repo.listLoadouts().map((loadout) => [loadout.id, loadout]));
  const harnesses = profiles.map((profile) => {
    const assignment = assignments.find((item) => item.harness_id === profile.id) ?? null;
    const loadout = assignment ? loadouts.get(assignment.loadout_id) ?? null : null;
    const activeArtifacts = assignment && assignment.active && loadout ? resolveLoadoutArtifacts(repo, loadout) : [];
    return {
      harness_id: profile.id,
      harness_name: profile.name,
      active_loadout: assignment && assignment.active ? loadout?.name ?? assignment.loadout_id : null,
      active_artifacts: activeArtifacts.length,
      active_artifact_ids: activeArtifacts.map((artifact) => artifact.id)
    };
  });
  const status = { deployments: deployments.length, orphans, harnesses };
  if (args.includes("--json")) printJson(status);
  else {
    const lines = [
      `Deployments: ${status.deployments}`,
      `Orphans: ${orphans.length}`,
      ...harnesses.map((harness) => `${harness.harness_id}\t${harness.active_loadout ?? "inactive"}\t${harness.active_artifacts}`)
    ];
    printText(lines);
  }
}
