import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { auditArtifacts } from "../../src/core/audit/auditor";
import { loadBuiltInProfiles } from "../../src/core/audit/profile-registry";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { createDeploymentPlan } from "../../src/core/deploy/plan";
import { fixtureLibrary, tempRepo } from "../helpers";

test("deployment preview writes nothing and requires confirmation", async () => {
  const { repo, dir } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  const profile = loadBuiltInProfiles().find((p) => p.id === "claude-code")!;
  const verdicts = auditArtifacts(repo, [profile]);
  const targetRoot = join(dir, "target");
  const plan = createDeploymentPlan({ artifacts: repo.listArtifacts(), verdicts, profile, targetRoot });
  expect(plan.requires_confirmation).toBe(true);
  expect(existsSync(targetRoot)).toBe(false);
});
