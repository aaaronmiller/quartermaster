import { expect, test } from "bun:test";
import { createDeterministicProposal } from "../../src/core/evaluation/workflows";
import { tempRepo } from "../helpers";

test("evaluation proposal creation has no deployment side effects", () => {
  const { repo } = tempRepo();
  createDeterministicProposal(repo, "comparison", { a: "one", b: "two" }, "A reviewable comparison was requested.");
  expect(repo.listProposals()).toHaveLength(1);
  expect(repo.listDeployments()).toHaveLength(0);
  expect(repo.listLoadouts()).toHaveLength(0);
});
