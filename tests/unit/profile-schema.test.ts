import { expect, test } from "bun:test";
import { loadBuiltInProfiles } from "../../src/core/audit/profile-registry";

test("built-in profiles validate and include required harnesses", () => {
  const profiles = loadBuiltInProfiles();
  expect(profiles.map((profile) => profile.id).sort()).toEqual(["antigravity", "claude-code", "codex", "opencode"]);
  for (const profile of profiles) {
    expect(profile.name.length).toBeGreaterThan(0);
    expect(profile.version).toBe(1);
  }
});
