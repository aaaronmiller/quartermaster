import { expect, test } from "bun:test";
import { renderGuidance } from "../../src/core/guidance/render";

test("guidance rendering preserves user content outside managed markers", () => {
  const rendered = renderGuidance("Keep this user rule.\n", [{ id: "p1", name: "Coding", use_case: "code", directive: "Use strict checks.", origin: "hand", members: [], updated_at: "now" }]);
  expect(rendered).toContain("Keep this user rule.");
  expect(rendered).toContain("<!-- QUARTERMASTER MANAGED START -->");
  const rerendered = renderGuidance(rendered, [{ id: "p2", name: "Research", use_case: "research", directive: "Cite sources.", origin: "hand", members: [], updated_at: "now" }]);
  expect(rerendered).toContain("Keep this user rule.");
  expect(rerendered).not.toContain("Use strict checks.");
  expect(rerendered).toContain("Cite sources.");
});
