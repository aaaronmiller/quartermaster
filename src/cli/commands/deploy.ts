import { createDeploymentPlan } from "../../core/deploy/plan";
import { applyPlacement } from "../../core/deploy/placer";
import { createDeploymentRecord } from "../../core/deploy/records";
import { applyRollback, createRollbackPlan } from "../../core/deploy/rollback";
import { scopeArtifacts } from "../../core/deploy/scope";
import { loadProfiles } from "../../core/audit/profile-registry";
import { argValue, fail, hasFlag, printJson, printText } from "../output";
import type { Repository } from "../../storage/repository";

export function deployCommand(repo: Repository, args: string[]): void {
  const sub = args[0];
  const harness = argValue(args, "--harness");
  const profiles = loadProfiles();
  const profile = profiles.find((candidate) => candidate.id === harness) ?? profiles[0];
  if (!profile) fail("No harness profiles available");
  if (sub === "rollback") {
    const id = args[1];
    if (!id) fail("qm deploy rollback requires deployment id");
    const record = repo.getDeployment(id);
    if (!record) fail(`Deployment not found: ${id}`);
    const operations = hasFlag(args, "--yes") ? applyRollback(record) : createRollbackPlan(record);
    printJson({ rollback: hasFlag(args, "--yes") ? "applied" : "preview", operations });
    return;
  }
  const artifacts = scopeArtifacts(repo.listArtifacts(), { loadout: null, path: argValue(args, "--path"), type: null });
  const planInput: Parameters<typeof createDeploymentPlan>[0] = {
    artifacts,
    verdicts: repo.listVerdicts(),
    profile,
    scope: argValue(args, "--path") ?? "all"
  };
  const targetRoot = argValue(args, "--target-root");
  if (targetRoot) planInput.targetRoot = targetRoot;
  const plan = createDeploymentPlan(planInput);
  if (sub === "apply") {
    if (!hasFlag(args, "--yes")) fail("qm deploy apply requires --yes for non-interactive apply");
    const operations = plan.placements.filter((op) => op.kind !== "skip").map(applyPlacement);
    const record = createDeploymentRecord(plan, operations);
    repo.saveDeployment(record);
    printJson({ deployment: record });
    return;
  }
  if (args.includes("--json")) printJson({ plan });
  else printText(plan.placements.map((op) => `${op.kind}\t${op.artifact_id ?? ""}\t${op.target_path ?? ""}\t${op.reason ?? ""}`));
}
