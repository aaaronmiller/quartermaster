import { expect, test } from "bun:test";
import { auditArtifacts } from "../../src/core/audit/auditor";
import { loadBuiltInProfiles } from "../../src/core/audit/profile-registry";
import { scanLibrary } from "../../src/core/catalog/scanner";
import { nowIso, stableId, type EvaluationProposal, type Loadout, type Pipeline } from "../../src/core/types";
import { queryArtifactSearch, querySummary } from "../../src/query/commands";
import { renderTuiState } from "../../src/tui/app";
import { createRoutes } from "../../src/web/server/routes";
import { fixtureLibrary, tempRepo } from "../helpers";

test("surface summary and search expose real catalog state", async () => {
  const { repo } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  auditArtifacts(repo, loadBuiltInProfiles());
  seedActivationState(repo);

  const summary = querySummary(repo) as {
    catalog: { total: number; by_type: Record<string, number>; risky: number };
    compatibility: { total: number; by_harness: Record<string, unknown> };
    loadouts: { total: number; names: string[] };
    activation: { total: number; active: number; by_harness: Record<string, { active: boolean }> };
    pipelines: { total: number; names: string[] };
    proposals: { pending: number };
    recommendations: string[];
  };

  expect(summary.catalog.total).toBeGreaterThanOrEqual(8);
  expect(summary.catalog.by_type.skill).toBeGreaterThan(0);
  expect(summary.compatibility.total).toBeGreaterThan(0);
  expect(Object.keys(summary.compatibility.by_harness)).toContain("claude-code");
  expect(summary.loadouts.names).toContain("coding");
  expect(summary.pipelines.names).toContain("research-report");
  expect(summary.proposals.pending).toBe(1);
  expect(summary.activation.total).toBe(1);
  expect(summary.activation.by_harness["claude-code"]?.active).toBe(true);

  const search = queryArtifactSearch(repo, { text: "deep", type: "skill" }) as { artifacts: { name: string; type: string }[] };
  expect(search.artifacts.length).toBeGreaterThan(0);
  expect(search.artifacts.every((artifact) => artifact.type === "skill")).toBe(true);
});

test("TUI state contains operator sections over repository data", async () => {
  const { repo } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  auditArtifacts(repo, loadBuiltInProfiles());

  const state = renderTuiState(repo) as {
    title: string;
    sections: { id: string; metrics: { label: string; value: number }[]; commands: string[] }[];
  };

  expect(state.title).toBe("Quartermaster");
  expect(state.sections.map((section) => section.id)).toEqual(["catalog", "compatibility", "activation", "review"]);
  expect(state.sections[0]!.metrics.find((metric) => metric.label === "Artifacts")!.value).toBeGreaterThan(0);
  expect(state.sections.flatMap((section) => section.commands)).toContain("qm audit --matrix --json");
});

test("web routes serve dashboard, search, and deploy preview JSON", async () => {
  const { repo } = tempRepo();
  await scanLibrary(repo, fixtureLibrary());
  auditArtifacts(repo, loadBuiltInProfiles());
  seedActivationState(repo);
  const app = createRoutes(repo);

  const shell = await (await app.request("/")).text();
  expect(shell).toContain("Artifact fleet control");
  expect(shell).toContain("create-loadout");
  expect(shell).toContain("run-audit");
  expect(shell).toContain("create-pipeline");
  expect(shell).toContain("assign-loadout");
  expect(shell).toContain("assignment-harness");
  expect(shell).toContain("llm-audit");
  expect(shell).toContain("llm-improve");
  expect(shell).toContain("llm-fix");
  expect(shell).toContain("Skill Sequence Controls");
  expect(shell).toContain("Replace/Reorder Loadout");
  expect(shell).toContain("Remove Member");
  expect(shell).toContain("Audit Active Skills for All CLIs");
  expect(shell).toContain("Scan Library");
  expect(shell).toContain("Preview Deploy");
  expect(shell).toContain("Copy or Move Assignment");
  expect(shell).toContain("Validate Pipeline");
  expect(shell).toContain("Query Compatibility");

  const dashboard = await (await app.request("/api/dashboard")).json() as { catalog: { total: number } };
  expect(dashboard.catalog.total).toBeGreaterThan(0);

  const search = await (await app.request("/api/catalog/search?q=deep&type=skill")).json() as { artifacts: { type: string }[] };
  expect(search.artifacts.length).toBeGreaterThan(0);
  expect(search.artifacts.every((artifact) => artifact.type === "skill")).toBe(true);

  const preview = await (await app.request("/api/deploy/preview/claude-code")).json() as { harness_id: string; placements: unknown[] };
  expect(preview.harness_id).toBe("claude-code");
  expect(preview.placements.length).toBeGreaterThan(0);

  const pipeline = repo.listPipelines()[0] ?? null;
  if (pipeline) {
    const validation = await (await app.request(`/api/pipelines/${pipeline.id}/validate`)).json() as { valid: boolean };
    expect(validation.valid).toBe(true);
  }

  const auditPage = await (await app.request("/web/audit/run", { method: "POST", body: new URLSearchParams({ harness: "claude-code" }) })).text();
  expect(auditPage).toContain("<title>Compatibility Audit");
  expect(auditPage).toContain("Back to Quartermaster");
  expect(auditPage).toContain("verdicts");

  const compatibilityPage = await (await app.request("/web/query/compatibility?artifact=missing")).text();
  expect(compatibilityPage).toContain("<title>Compatibility Query");
  expect(compatibilityPage).toContain("Back to Quartermaster");
  expect(compatibilityPage).toContain("artifact_id");
});

function seedActivationState(repo: ReturnType<typeof tempRepo>["repo"]): void {
  const now = nowIso();
  const firstTwo = repo.listArtifacts().slice(0, 2).map((artifact) => artifact.id);
  const loadout: Loadout = {
    id: stableId("loadout", "coding"),
    name: "coding",
    description: "Focused coding artifacts",
    members: firstTwo,
    updated_at: now
  };
  const pipeline: Pipeline = {
    id: stableId("pipeline", "research-report"),
    name: "research-report",
    use_case: "Research report drafting",
    directive: "Use selected research and writing skills in order when producing a research report.",
    origin: "hand",
    members: firstTwo,
    updated_at: now
  };
  const proposal: EvaluationProposal = {
    id: stableId("proposal", "loadout", now),
    kind: "loadout",
    payload: { name: "business", members: firstTwo },
    rationale: "The selected artifacts share a business reporting use case.",
    model: "test-model",
    turns: 1,
    accepted: null,
    created_at: now
  };
  repo.saveLoadout(loadout);
  repo.saveLoadoutAssignment({
    harness_id: "claude-code",
    loadout_id: loadout.id,
    active: true,
    assigned_at: now
  });
  repo.savePipeline(pipeline);
  repo.saveProposal(proposal);
}
