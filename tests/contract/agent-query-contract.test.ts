import { expect, test } from "bun:test";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { queryArtifacts, queryCompatibility, queryDeployment } from "../../src/query/commands";
import { fixtureLibrary, tempRepo } from "../helpers";

test("agent query JSON exposes stable fields", async () => {
  const { repo } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  const artifacts = queryArtifacts(repo) as { artifacts: { id: string; type: string; name: string; org_path: string; required_capabilities: unknown[]; risk_flags: unknown[]; source_id: string }[] };
  expect(artifacts.artifacts[0]).toContainKeys(["id", "type", "name", "org_path", "required_capabilities", "risk_flags", "source_id"]);
  expect(queryCompatibility(repo, artifacts.artifacts[0]!.id)).toContainKey("verdicts");
  expect(queryDeployment(repo, "claude-code")).toContainKeys(["harness_id", "active_loadout", "deployed_artifacts", "drift", "orphans"]);
});
