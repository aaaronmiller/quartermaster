import { expect, test } from "bun:test";
import { createDeterministicProposal } from "../../src/core/evaluation/workflows";
import { tempRepo } from "../helpers";

test("proposal accept or reject remains explicit", () => {
  const { repo } = tempRepo();
  const proposal = createDeterministicProposal(repo, "loadout", { members: [] }, "Reviewable loadout proposal.");
  expect(proposal.accepted).toBeNull();
  expect(repo.listLoadouts()).toEqual([]);
});
