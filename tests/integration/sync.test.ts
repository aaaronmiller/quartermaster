import { expect, test } from "bun:test";
import { checkUpstream } from "../../src/core/catalog/sync";
import { nowIso } from "../../src/core/types";
import { tempRepo } from "../helpers";

test("sync reports local source unchanged without overwriting", () => {
  const { repo } = tempRepo();
  repo.upsertSource({ id: "local", kind: "local", reference: "/tmp/local", updated_at: nowIso() });
  expect(checkUpstream(repo)).toEqual([{ source_id: "local", status: "unchanged", reason: null }]);
});
