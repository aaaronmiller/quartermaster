import { Hono, type Context } from "hono";
import type { Repository } from "../../storage/repository";
import type { ArtifactType, SourceKind } from "../../core/types";
import { queryArtifactSearch, queryArtifacts, queryCompatibility, queryDeployment, queryLoadouts, queryPipelines, queryProposals, querySummary } from "../../query/commands";
import { auditArtifacts } from "../../core/audit/auditor";
import { loadProfiles } from "../../core/audit/profile-registry";
import { createDeploymentPlan } from "../../core/deploy/plan";
import { applyPlacement } from "../../core/deploy/placer";
import { createDeploymentRecord } from "../../core/deploy/records";
import { applyRollback, createRollbackPlan } from "../../core/deploy/rollback";
import { activeLoadoutForHarness, copyLoadoutAssignment, createLoadout, addLoadoutMember, removeLoadoutMember, resolveLoadoutArtifacts, updateLoadoutMembers } from "../../core/loadouts/loadouts";
import { addPipelineToLoadout, createPipeline, validatePipeline } from "../../core/loadouts/pipelines";
import { scopeArtifactsFromRepository } from "../../core/deploy/scope";
import { createSkillReviewProposal } from "../../core/evaluation/workflows";
import { acceptProposal, rejectProposal } from "../../core/evaluation/accept";
import { scanLibrary } from "../../core/catalog/scanner";
import { importSource } from "../../core/catalog/importers";
import { checkUpstream } from "../../core/catalog/sync";
import { renderGuidance } from "../../core/guidance/render";
import { renderWebShell } from "./page";
import { nowIso } from "../../core/types";

export function createRoutes(repo: Repository): Hono {
  const app = new Hono();
  app.get("/", (c) => c.html(renderWebShell()));
  app.get("/dashboard", (c) => c.html(renderWebShell()));
  app.get("/catalog", (c) => c.html(renderWebShell()));
  app.get("/audit", (c) => c.html(renderWebShell()));
  app.get("/loadouts", (c) => c.html(renderWebShell()));
  app.get("/pipelines", (c) => c.html(renderWebShell()));
  app.get("/proposals", (c) => c.html(renderWebShell()));
  app.post("/web/scan", async (c) => {
    const body = await form(c.req);
    return htmlResult(c, "Scan Library", await scanLibrary(repo, required(body.root, "root")));
  });
  app.get("/web/catalog/search", (c) => {
    const query = c.req.query();
    return htmlResult(c, "Catalog Search", queryArtifactSearch(repo, compactSearchInput({
      text: query.q,
      type: query.type as ArtifactType | undefined,
      capability: query.capability,
      org_path: query.path
    })));
  });
  app.get("/web/catalog/show", (c) => htmlResult(c, "Artifact", { artifact: repo.getArtifact(required(c.req.query("id"), "artifact id")) }));
  app.post("/web/audit/run", async (c) => {
    const body = await form(c.req);
    const harness = text(body.harness);
    const profiles = loadProfiles().filter((profile) => !harness || profile.id === harness);
    return htmlResult(c, "Compatibility Audit", { verdicts: auditArtifacts(repo, profiles) });
  });
  app.get("/web/audit/active", (c) => htmlResult(c, "Active Skill Audit Across CLIs", buildActiveSkillAudit(repo)));
  app.post("/web/deploy/preview", async (c) => {
    const body = await form(c.req);
    return htmlResult(c, "Deployment Preview", createDeploymentPlanFromWeb(repo, body));
  });
  app.post("/web/deploy/apply", async (c) => {
    const body = await form(c.req);
    if (text(body.confirmApply) !== "true") return htmlResult(c, "Deployment Apply Blocked", { error: "Confirm apply must be checked before writing target files." }, 400);
    const plan = createDeploymentPlanFromWeb(repo, body);
    const operations = plan.placements.filter((op) => op.kind !== "skip").map(applyPlacement);
    const deployment = createDeploymentRecord(plan, operations);
    repo.saveDeployment(deployment);
    return htmlResult(c, "Deployment Applied", { deployment });
  });
  app.post("/web/deploy/rollback", async (c) => {
    const body = await form(c.req);
    const record = repo.getDeployment(required(body.id, "deployment id"));
    if (!record) return htmlResult(c, "Rollback", { error: "Deployment not found" }, 404);
    const applied = text(body.confirmApply) === "true";
    return htmlResult(c, applied ? "Rollback Applied" : "Rollback Preview", { operations: applied ? applyRollback(record) : createRollbackPlan(record) });
  });
  app.post("/web/import", async (c) => {
    const body = await form(c.req);
    return htmlResult(c, "Import Source", {
      source: importSource(repo, {
        kind: (text(body.kind) || "local") as SourceKind,
        reference: required(body.source, "source"),
        destinationRoot: text(body.dest) || ".quartermaster/imports"
      })
    });
  });
  app.post("/web/sync", (c) => htmlResult(c, "Sync Status", { sources: checkUpstream(repo) }));
  app.post("/web/guidance/render", async (c) => {
    const body = await form(c.req);
    const harness = text(body.harness);
    const loadout = harness ? activeLoadoutForHarness(repo, harness) : null;
    const pipelines = loadout ? repo.listPipelines().filter((pipeline) => loadout.members.includes(pipeline.id)) : repo.listPipelines();
    return htmlResult(c, "Guidance Render", { harness: harness || "all", guidance: renderGuidance("", pipelines) });
  });
  app.get("/web/status", (c) => htmlResult(c, "Status", buildWebStatus(repo)));
  app.get("/web/query/deployment", (c) => htmlResult(c, "Deployment Query", queryDeployment(repo, required(c.req.query("harness"), "harness"))));
  app.get("/web/query/compatibility", (c) => htmlResult(c, "Compatibility Query", queryCompatibility(repo, required(c.req.query("artifact"), "artifact id"))));
  app.get("/web/proposals", (c) => htmlResult(c, "Proposals", queryProposals(repo)));
  app.post("/web/proposals/decision", async (c) => {
    const body = await form(c.req);
    const id = required(body.id, "proposal id");
    try {
      return htmlResult(c, "Proposal Decision", text(body.decision) === "reject" ? { proposal: rejectProposal(repo, id), applied: null } : acceptProposal(repo, id));
    } catch (error) {
      return htmlResult(c, "Proposal Decision", { error: error instanceof Error ? error.message : String(error) }, 404);
    }
  });
  app.post("/web/loadouts", async (c) => {
    const body = await form(c.req);
    const loadout = createLoadout(repo, required(body.name, "loadout name"), ids(body.artifactIds), text(body.description) || null);
    return htmlResult(c, "Loadout Created", { loadout });
  });
  app.post("/web/loadouts/members", async (c) => {
    const body = await form(c.req);
    let loadout = repo.getLoadout(required(body.loadoutId, "loadout id"));
    if (!loadout) return htmlResult(c, "Loadout Members", { error: "Loadout not found" }, 404);
    for (const artifactId of ids(body.artifactIds)) loadout = addLoadoutMember(repo, loadout.id, artifactId);
    return htmlResult(c, "Loadout Updated", { loadout });
  });
  app.post("/web/loadouts/update", async (c) => {
    const body = await form(c.req);
    try {
      return htmlResult(c, "Loadout Edited", {
        loadout: updateLoadoutMembers(repo, required(body.loadoutId, "loadout id"), ids(body.artifactIds), text(body.description) || undefined)
      });
    } catch (error) {
      return htmlResult(c, "Loadout Edit", { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
  app.post("/web/loadouts/remove-member", async (c) => {
    const body = await form(c.req);
    try {
      return htmlResult(c, "Loadout Member Removed", {
        loadout: removeLoadoutMember(repo, required(body.loadoutId, "loadout id"), required(body.memberId, "member id"))
      });
    } catch (error) {
      return htmlResult(c, "Loadout Member Remove", { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
  app.post("/web/loadouts/assign", async (c) => {
    const body = await form(c.req);
    const loadout = repo.getLoadout(required(body.loadoutId, "loadout id"));
    if (!loadout) return htmlResult(c, "Loadout Assignment", { error: "Loadout not found" }, 404);
    const assignment = { harness_id: required(body.harness, "harness"), loadout_id: loadout.id, active: text(body.active) === "true", assigned_at: nowIso() };
    repo.saveLoadoutAssignment(assignment);
    return htmlResult(c, "Loadout Assigned", { assignment });
  });
  app.post("/web/loadouts/copy", async (c) => {
    const body = await form(c.req);
    try {
      return htmlResult(c, "Loadout Assignment Copied", {
        assignment: copyLoadoutAssignment(repo, required(body.from, "from harness"), required(body.to, "to harness"), text(body.mode) === "move")
      });
    } catch (error) {
      return htmlResult(c, "Loadout Assignment", { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
  app.post("/web/pipelines", async (c) => {
    const body = await form(c.req);
    const pipeline = createPipeline(repo, {
      name: required(body.name, "sequence name"),
      use_case: text(body.use_case) || required(body.name, "sequence name"),
      directive: text(body.directive) || "Use the selected skills in sequence for the stated use case.",
      origin: "hand",
      members: ids(body.artifactIds)
    });
    return htmlResult(c, "Skill Sequence Created", { pipeline });
  });
  app.get("/web/pipelines/validate", (c) => htmlResult(c, "Pipeline Validation", validatePipeline(repo, required(c.req.query("id"), "pipeline id"))));
  app.post("/web/pipelines/add-to-loadout", async (c) => {
    const body = await form(c.req);
    try {
      return htmlResult(c, "Pipeline Added to Loadout", { loadout: addPipelineToLoadout(repo, required(body.loadout, "loadout"), required(body.pipeline, "pipeline")) });
    } catch (error) {
      return htmlResult(c, "Pipeline Add to Loadout", { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
  app.post("/web/evaluate/skill-review", async (c) => {
    const body = await form(c.req);
    try {
      const proposal = await createSkillReviewProposal(repo, {
        artifactIds: ids(body.artifactIds),
        mode: text(body.mode) === "fix" ? "fix" : text(body.mode) === "improvement" ? "improvement" : "audit",
        ...(text(body.instruction) ? { instruction: text(body.instruction) } : {}),
        ...(text(body.model) ? { model: text(body.model) } : {})
      });
      return htmlResult(c, "LLM Skill Review", { proposal });
    } catch (error) {
      return htmlResult(c, "LLM Skill Review", { error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
  app.get("/api/dashboard", (c) => c.json(querySummary(repo)));
  app.get("/api/catalog", (c) => c.json(queryArtifacts(repo)));
  app.get("/api/catalog/search", (c) => {
    const query = c.req.query();
    return c.json(queryArtifactSearch(repo, compactSearchInput({
      text: query.q,
      type: query.type as ArtifactType | undefined,
      capability: query.capability,
      risk: query.risk,
      source_id: query.source,
      org_path: query.path
    })));
  });
  app.get("/api/audit", (c) => c.json({ verdicts: auditArtifacts(repo, loadProfiles()) }));
  app.get("/api/deploy/preview/:harness", (c) => {
    const profiles = loadProfiles();
    const profile = profiles.find((candidate) => candidate.id === c.req.param("harness"));
    if (!profile) return c.json({ error: "unknown harness" }, 404);
    const verdicts = repo.listVerdicts().length ? repo.listVerdicts() : auditArtifacts(repo, profiles);
    const targetRoot = c.req.query("targetRoot");
    const loadoutName = c.req.query("loadout");
    const loadout = loadoutName ? repo.getLoadout(loadoutName) : activeLoadoutForHarness(repo, profile.id);
    const artifacts = scopeArtifactsFromRepository(repo, { loadout, path: c.req.query("path") ?? null, type: null });
    return c.json(createDeploymentPlan({ artifacts, verdicts, profile, scope: loadout ? `loadout:${loadout.name}` : "all", ...(targetRoot ? { targetRoot } : {}) }));
  });
  app.get("/api/loadouts", (c) => c.json(queryLoadouts(repo)));
  app.get("/api/harnesses", (c) => {
    const profiles = loadProfiles();
    const assignments = repo.listLoadoutAssignments();
    const loadouts = new Map(repo.listLoadouts().map((loadout) => [loadout.id, loadout]));
    return c.json({
      harnesses: profiles.map((profile) => {
        const assignment = assignments.find((item) => item.harness_id === profile.id) ?? null;
        const loadout = assignment ? loadouts.get(assignment.loadout_id) ?? null : null;
        return {
          ...profile,
          assignment: assignment
            ? {
                loadout_id: assignment.loadout_id,
                active: assignment.active,
                assigned_at: assignment.assigned_at
              }
            : null,
          active_loadout: assignment && assignment.active ? loadout?.name ?? assignment.loadout_id : null,
          active_artifacts: assignment && assignment.active ? loadout?.members.length ?? 0 : 0
        };
      })
    });
  });
  app.get("/api/pipelines", (c) => c.json(queryPipelines(repo)));
  app.get("/api/proposals", (c) => c.json(queryProposals(repo)));
  app.get("/api/guidance", (c) => c.json({ pipelines: repo.listPipelines(), guidance: repo.listGuidance() }));
  app.post("/api/audit/run", (c) => {
    const verdicts = auditArtifacts(repo, loadProfiles());
    return c.json({ verdicts });
  });
  app.post("/api/loadouts", async (c) => {
    const body = await c.req.json<{ name: string; description?: string; members?: string[] }>();
    const loadout = createLoadout(repo, body.name, body.members ?? [], body.description ?? null);
    return c.json({ loadout }, 201);
  });
  app.post("/api/loadouts/:harness/assign", async (c) => {
    const body = await c.req.json<{ loadoutId?: string; loadoutName?: string; active?: boolean }>();
    const harness = c.req.param("harness");
    const loadoutKey = body.loadoutId ?? body.loadoutName;
    if (!loadoutKey) return c.json({ error: "loadoutId or loadoutName required" }, 400);
    const loadout = repo.getLoadout(loadoutKey);
    if (!loadout) return c.json({ error: "loadout not found" }, 404);
    const assignment = {
      harness_id: harness,
      loadout_id: loadout.id,
      active: body.active ?? true,
      assigned_at: nowIso()
    };
    repo.saveLoadoutAssignment(assignment);
    return c.json({ assignment }, 201);
  });
  app.post("/api/loadouts/:id/members", async (c) => {
    const body = await c.req.json<{ artifactIds?: string[] }>();
    const loadoutId = c.req.param("id");
    const artifactIds = body.artifactIds ?? [];
    let loadout = repo.getLoadout(loadoutId);
    if (!loadout) return c.json({ error: "loadout not found" }, 404);
    for (const artifactId of artifactIds) {
      loadout = addLoadoutMember(repo, loadout.id, artifactId);
    }
    return c.json({ loadout });
  });
  app.post("/api/pipelines", async (c) => {
    const body = await c.req.json<{ name: string; use_case: string; directive: string; members?: string[] }>();
    const pipeline = createPipeline(repo, { name: body.name, use_case: body.use_case, directive: body.directive, origin: "hand", members: body.members ?? [] });
    return c.json({ pipeline }, 201);
  });
  app.get("/api/pipelines/:id/validate", (c) => c.json(validatePipeline(repo, c.req.param("id"))));
  app.post("/api/pipelines/:id/add-to-loadout", async (c) => {
    const body = await c.req.json<{ loadoutId?: string; loadoutName?: string }>();
    const loadoutKey = body.loadoutId ?? body.loadoutName;
    if (!loadoutKey) return c.json({ error: "loadoutId or loadoutName required" }, 400);
    return c.json({ loadout: addPipelineToLoadout(repo, loadoutKey, c.req.param("id")) });
  });
  app.post("/api/proposals/:id/:decision", (c) => {
    const decision = c.req.param("decision");
    if (!["accept", "reject"].includes(decision)) return c.json({ error: "decision must be accept or reject" }, 400);
    try {
      return c.json(decision === "accept" ? acceptProposal(repo, c.req.param("id")) : { proposal: rejectProposal(repo, c.req.param("id")), applied: null });
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 404);
    }
  });
  app.post("/api/evaluate/skill-review", async (c) => {
    const body = await c.req.json<{ artifactIds?: string[]; mode?: "audit" | "improvement"; instruction?: string; model?: string }>();
    try {
      const proposal = await createSkillReviewProposal(repo, {
        artifactIds: body.artifactIds ?? [],
        mode: body.mode ?? "audit",
        ...(body.instruction ? { instruction: body.instruction } : {}),
        ...(body.model ? { model: body.model } : {})
      });
      return c.json({ proposal }, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });
  app.get("/api/loadouts/:id/active-artifacts", (c) => {
    const loadout = repo.getLoadout(c.req.param("id"));
    if (!loadout) return c.json({ error: "loadout not found" }, 404);
    return c.json({ loadout, artifacts: resolveLoadoutArtifacts(repo, loadout) });
  });
  app.onError((error, c) => htmlResult(c, "Quartermaster Web Error", { error: error instanceof Error ? error.message : String(error) }, 500));
  return app;
}

function compactSearchInput(input: {
  text?: string | undefined;
  type?: ArtifactType | undefined;
  capability?: string | undefined;
  risk?: string | undefined;
  source_id?: string | undefined;
  org_path?: string | undefined;
}): Parameters<typeof queryArtifactSearch>[1] {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined && value !== "")) as Parameters<typeof queryArtifactSearch>[1];
}

async function form(req: { parseBody: () => Promise<Record<string, FormDataEntryValue | FormDataEntryValue[]>> }): Promise<Record<string, FormDataEntryValue | FormDataEntryValue[]>> {
  return req.parseBody();
}

function text(value: unknown): string {
  if (Array.isArray(value)) return text(value[0]);
  return typeof value === "string" ? value.trim() : "";
}

function required(value: unknown, label: string): string {
  const parsed = text(value);
  if (!parsed) throw new Error(`${label} is required`);
  return parsed;
}

function ids(value: unknown): string[] {
  return text(value).split(/[\n, ]+/).map((item) => item.trim()).filter(Boolean);
}

function createDeploymentPlanFromWeb(repo: Repository, body: Record<string, unknown>) {
  const harness = required(body.harness, "harness");
  const profiles = loadProfiles();
  const profile = profiles.find((candidate) => candidate.id === harness);
  if (!profile) throw new Error(`Unknown harness: ${harness}`);
  const verdicts = repo.listVerdicts().length ? repo.listVerdicts() : auditArtifacts(repo, profiles);
  const loadoutName = text(body.loadout);
  const loadout = loadoutName ? repo.getLoadout(loadoutName) : activeLoadoutForHarness(repo, profile.id);
  const artifacts = scopeArtifactsFromRepository(repo, { loadout, path: text(body.path) || null, type: null });
  const targetRoot = text(body.targetRoot);
  return createDeploymentPlan({
    artifacts,
    verdicts,
    profile,
    scope: loadout ? `loadout:${loadout.name}` : text(body.path) || "all",
    ...(targetRoot ? { targetRoot } : {})
  });
}

function buildWebStatus(repo: Repository): unknown {
  const deployments = repo.listDeployments();
  const artifactIds = new Set(repo.listArtifacts().map((artifact) => artifact.id));
  const assignments = repo.listLoadoutAssignments();
  return {
    catalog: { artifacts: artifactIds.size, sources: repo.listSources().length },
    deployments: deployments.map((deployment) => ({ id: deployment.id, harness_id: deployment.harness_id, applied_at: deployment.applied_at, operations: deployment.operations.length })),
    assignments,
    orphans: deployments.flatMap((record) => record.operations).filter((operation) => operation.artifact_id && !artifactIds.has(operation.artifact_id))
  };
}

function buildActiveSkillAudit(repo: Repository): unknown {
  const profiles = loadProfiles();
  const verdicts = repo.listVerdicts().length ? repo.listVerdicts() : auditArtifacts(repo, profiles);
  return profiles.map((profile) => {
    const loadout = activeLoadoutForHarness(repo, profile.id);
    const artifacts = loadout ? resolveLoadoutArtifacts(repo, loadout) : [];
    return {
      harness_id: profile.id,
      harness_name: profile.name,
      active_loadout: loadout?.name ?? null,
      active_count: artifacts.length,
      skills: artifacts.map((artifact) => {
        const verdict = verdicts.find((candidate) => candidate.harness_id === profile.id && candidate.artifact_id === artifact.id);
        return {
          id: artifact.id,
          name: artifact.name,
          type: artifact.type,
          path: artifact.org_path,
          compatibility: verdict?.result ?? "missing",
          reason: verdict?.reason ?? null,
          risk_flags: artifact.risk_flags
        };
      })
    };
  });
}

function htmlResult(c: Context, title: string, value: unknown, status: 200 | 400 | 404 | 500 = 200): Response {
  return c.html(renderResultPage(title, value), status);
}

function renderResultPage(title: string, value: unknown): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} - Quartermaster</title>
  <style>
    body{margin:0;background:#070a0d;color:#e8ece8;font-family:IBM Plex Sans,Segoe UI,sans-serif}
    main{width:min(1200px,calc(100vw - 32px));margin:0 auto;padding:28px 0 64px}
    a,button{color:#5be0b3}
    .top{display:flex;justify-content:space-between;align-items:center;gap:16px;border-bottom:1px solid #24424a;padding-bottom:18px;margin-bottom:22px}
    .panel{border:1px solid #24424a;border-radius:8px;background:#0d1418;padding:18px;overflow:auto}
    table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #24424a;padding:8px;text-align:left;vertical-align:top}
    code{color:#8ea49f;white-space:pre-wrap}.bad{color:#ff6b6b}.ok{color:#5be0b3}
  </style>
</head>
<body><main><div class="top"><h1>${escapeHtml(title)}</h1><a href="/">Back to Quartermaster</a></div><section class="panel">${renderValue(value)}</section></main></body></html>`;
}

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return "<span class=\"muted\">None</span>";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return `<code>${escapeHtml(String(value))}</code>`;
  if (Array.isArray(value)) {
    if (!value.length) return "<span>No rows.</span>";
    return `<table><tbody>${value.map((item, index) => `<tr><th>${index + 1}</th><td>${renderValue(item)}</td></tr>`).join("")}</tbody></table>`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return `<table><tbody>${entries.map(([key, item]) => `<tr><th>${escapeHtml(key)}</th><td>${renderValue(item)}</td></tr>`).join("")}</tbody></table>`;
  }
  return `<code>${escapeHtml(String(value))}</code>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]!));
}
