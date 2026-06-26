import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { auditArtifacts } from "../../src/core/audit/auditor";
import { loadBuiltInProfiles } from "../../src/core/audit/profile-registry";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { createDeploymentPlan } from "../../src/core/deploy/plan";
import { applyPlacement } from "../../src/core/deploy/placer";
import { createDeploymentRecord } from "../../src/core/deploy/records";
import { applyRollback } from "../../src/core/deploy/rollback";
import { fixtureLibrary, tempRepo } from "../helpers";

test("rollback removes created deployment targets", async () => {
  const { repo, dir } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  const profile = loadBuiltInProfiles().find((p) => p.id === "claude-code")!;
  const verdicts = auditArtifacts(repo, [profile]);
  const plan = createDeploymentPlan({ artifacts: repo.listArtifacts({ type: "skill" }), verdicts, profile, targetRoot: join(dir, "target") });
  const ops = plan.placements.filter((op) => op.kind !== "skip").map(applyPlacement);
  const record = createDeploymentRecord(plan, ops);
  expect(ops.some((op) => op.target_path && existsSync(op.target_path))).toBe(true);
  applyRollback(record);
  expect(ops.every((op) => !op.target_path || !existsSync(op.target_path))).toBe(true);
});
