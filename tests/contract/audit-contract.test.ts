import { expect, test } from "bun:test";
import { computeVerdict } from "../../src/core/audit/auditor";
import { loadBuiltInProfiles } from "../../src/core/audit/profile-registry";
import type { Artifact } from "../../src/core/types";

const baseArtifact: Artifact = {
  id: "a1",
  type: "hook",
  name: "Hook",
  org_path: "hooks/hook.yaml",
  abs_path: "/tmp/hook.yaml",
  content_hash: "hash",
  required_capabilities: [{ name: "hooks", dialect: "claude-code" }],
  risk_flags: [],
  source_id: "s1",
  is_self_authored: true,
  locally_modified: false,
  updated_at: "now"
};

test("profile-to-verdict behavior reports unsupported hooks", () => {
  const codex = loadBuiltInProfiles().find((profile) => profile.id === "codex")!;
  const verdict = computeVerdict(baseArtifact, codex);
  expect(verdict.result).toBe("incompatible");
  expect(verdict.reason).toContain("hook");
});
