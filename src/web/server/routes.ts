import { Hono } from "hono";
import type { Repository } from "../../storage/repository";
import { queryArtifacts } from "../../query/commands";
import { auditArtifacts } from "../../core/audit/auditor";
import { loadProfiles } from "../../core/audit/profile-registry";

export function createRoutes(repo: Repository): Hono {
  const app = new Hono();
  app.get("/catalog", (c) => c.json(queryArtifacts(repo)));
  app.get("/audit", (c) => c.json({ verdicts: auditArtifacts(repo, loadProfiles()) }));
  app.get("/loadouts", (c) => c.json({ loadouts: repo.listLoadouts() }));
  app.get("/guidance", (c) => c.json({ pipelines: repo.listPipelines() }));
  return app;
}
