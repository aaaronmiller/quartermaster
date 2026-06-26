import { expect, test } from "bun:test";
import { auditArtifacts } from "../../src/core/audit/auditor";
import { loadBuiltInProfiles } from "../../src/core/audit/profile-registry";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { createDeploymentPlan } from "../../src/core/deploy/plan";
import { fixtureLibrary, tempRepo } from "../helpers";

test("quickstart catalog, audit, and preview scenario", async () => {
  const { repo, dir } = tempRepo();
  const scan = await scanLibrary(repo, fixtureLibrary());
  expect(scan.artifacts.length).toBeGreaterThanOrEqual(8);
  const profiles = loadBuiltInProfiles();
  const verdicts = auditArtifacts(repo, profiles);
  expect(verdicts.some((v) => v.reason)).toBe(true);
  const plan = createDeploymentPlan({ artifacts: repo.listArtifacts(), verdicts, profile: profiles[0]!, targetRoot: `${dir}/target` });
  expect(plan.placements.length).toBeGreaterThan(0);
});
