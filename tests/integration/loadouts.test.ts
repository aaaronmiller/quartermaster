import { expect, test } from "bun:test";
import { assignLoadout, createLoadout } from "../../src/core/loadouts/loadouts";
import { scopeArtifacts } from "../../src/core/deploy/scope";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { fixtureLibrary, tempRepo } from "../helpers";

test("loadout assignment scopes artifacts", async () => {
  const { repo } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  const artifact = repo.listArtifacts()[0]!;
  const loadout = createLoadout(repo, "coding", [artifact.id]);
  const assignment = assignLoadout(repo, "claude-code", loadout.id, true);
  expect(scopeArtifacts(repo.listArtifacts(), { loadout, path: null, type: null })).toEqual([artifact]);
  expect(assignment.harness_id).toBe("claude-code");
  expect(repo.getLoadoutAssignment("claude-code")?.active).toBe(true);
});
