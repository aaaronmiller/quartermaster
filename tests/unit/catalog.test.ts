import { expect, test } from "bun:test";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { fixtureLibrary, tempRepo } from "../helpers";

test("scan catalogs all supported artifact types with metadata", async () => {
  const { repo } = tempRepo();
  const result = await scanLibrary(repo, fixtureLibrary());
  expect(result.errors).toEqual([]);
  expect(new Set(repo.listArtifacts().map((artifact) => artifact.type))).toEqual(new Set(["skill", "plugin", "agent", "hook", "script", "mcp", "command", "output_style"]));
  const skill = repo.listArtifacts({ type: "skill" })[0]!;
  expect(skill.name).toBe("Deep Research");
  expect(skill.org_path).toContain("research/deep-research");
});
