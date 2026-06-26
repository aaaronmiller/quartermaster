import { expect, test } from "bun:test";
import { normalizeFinding } from "../../src/core/safety/findings";

test("normalizes scanner severity", () => {
  const finding = normalizeFinding("artifact", "auditor", "HIGH risk: executes script");
  expect(finding.severity).toBe("high");
  expect(finding.score).toBeGreaterThan(0.5);
});
