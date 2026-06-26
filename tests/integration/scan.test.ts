import { expect, test } from "bun:test";
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { copyFixtureLibrary, tempRepo } from "../helpers";

test("incremental rescan reports changed artifact", async () => {
  const { repo } = tempRepo();
  const root = copyFixtureLibrary();
  const first = await scanLibrary(repo, root);
  expect(first.added).toBeGreaterThan(0);
  appendFileSync(join(root, "research/deep-research/SKILL.md"), "\nNew real content.\n");
  const second = await scanLibrary(repo, root);
  expect(second.changed).toBe(1);
});
