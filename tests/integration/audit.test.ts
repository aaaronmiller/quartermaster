import { expect, test } from "bun:test";
import { auditArtifacts } from "../../src/core/audit/auditor";
import { loadBuiltInProfiles } from "../../src/core/audit/profile-registry";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { fixtureLibrary, tempRepo } from "../helpers";

test("audit reports refusal, flatten transform, and config translation", async () => {
  const { repo } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  const verdicts = auditArtifacts(repo, loadBuiltInProfiles());
  expect(verdicts.some((v) => v.result === "incompatible" && v.reason)).toBe(true);
  expect(verdicts.some((v) => v.transformation === "flatten")).toBe(true);
  expect(verdicts.some((v) => v.transformation?.startsWith("translate:mcp"))).toBe(true);
});
