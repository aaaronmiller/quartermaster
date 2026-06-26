import type { Database } from "bun:sqlite";
import type {
  Artifact,
  AuditFinding,
  CompatibilityVerdict,
  DeploymentRecord,
  EvaluationProposal,
  GuidanceFile,
  Loadout,
  Pipeline,
  Source
} from "../core/types";

const json = {
  parse<T>(value: string): T {
    return JSON.parse(value) as T;
  },
  stringify(value: unknown): string {
    return JSON.stringify(value);
  }
};

export class Repository {
  constructor(private readonly db: Database) {}

  upsertSource(source: Source): void {
    this.db
      .query(`INSERT INTO sources VALUES (?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, reference=excluded.reference,
        ref_branch=excluded.ref_branch, imported_revision=excluded.imported_revision,
        pin_revision=excluded.pin_revision, updated_at=excluded.updated_at`)
      .run(source.id, source.kind, source.reference, source.ref_branch ?? null, source.imported_revision ?? null, source.pin_revision ?? null, source.updated_at);
  }

  getSource(id: string): Source | null {
    return (this.db.query("SELECT * FROM sources WHERE id = ?").get(id) as Source | null) ?? null;
  }

  listSources(): Source[] {
    return this.db.query("SELECT * FROM sources ORDER BY id").all() as Source[];
  }

  upsertArtifact(artifact: Artifact): void {
    this.db
      .query(`INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET type=excluded.type, name=excluded.name,
        description=excluded.description, version=excluded.version, org_path=excluded.org_path,
        abs_path=excluded.abs_path, content_hash=excluded.content_hash,
        required_capabilities=excluded.required_capabilities, risk_flags=excluded.risk_flags,
        source_id=excluded.source_id, is_self_authored=excluded.is_self_authored,
        locally_modified=excluded.locally_modified, updated_at=excluded.updated_at`)
      .run(
        artifact.id,
        artifact.type,
        artifact.name,
        artifact.description ?? null,
        artifact.version ?? null,
        artifact.org_path,
        artifact.abs_path,
        artifact.content_hash,
        json.stringify(artifact.required_capabilities),
        json.stringify(artifact.risk_flags),
        artifact.source_id,
        artifact.is_self_authored ? 1 : 0,
        artifact.locally_modified ? 1 : 0,
        artifact.updated_at
      );
  }

  listArtifacts(filters: Partial<Pick<Artifact, "type" | "source_id">> & { text?: string; org_path?: string } = {}): Artifact[] {
    const rows = this.db.query("SELECT * FROM artifacts ORDER BY org_path").all() as Record<string, unknown>[];
    return rows.map(rowToArtifact).filter((artifact) => {
      if (filters.type && artifact.type !== filters.type) return false;
      if (filters.source_id && artifact.source_id !== filters.source_id) return false;
      if (filters.org_path && !artifact.org_path.includes(filters.org_path)) return false;
      if (filters.text) {
        const haystack = `${artifact.name} ${artifact.description ?? ""} ${artifact.org_path}`.toLowerCase();
        if (!haystack.includes(filters.text.toLowerCase())) return false;
      }
      return true;
    });
  }

  getArtifact(id: string): Artifact | null {
    const row = this.db.query("SELECT * FROM artifacts WHERE id = ?").get(id) as Record<string, unknown> | null;
    return row ? rowToArtifact(row) : null;
  }

  replaceArtifactsForRoot(root: string, artifacts: Artifact[]): void {
    const keep = new Set(artifacts.map((artifact) => artifact.id));
    for (const existing of this.listArtifacts()) {
      if (existing.abs_path.startsWith(root) && !keep.has(existing.id)) {
        this.db.query("DELETE FROM artifacts WHERE id = ?").run(existing.id);
      }
    }
    for (const artifact of artifacts) this.upsertArtifact(artifact);
  }

  upsertVerdict(verdict: CompatibilityVerdict): void {
    this.db
      .query(`INSERT INTO compatibility_verdicts VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(artifact_id,harness_id) DO UPDATE SET result=excluded.result, reason=excluded.reason,
      transformation=excluded.transformation, override_note=excluded.override_note, computed_at=excluded.computed_at`)
      .run(verdict.artifact_id, verdict.harness_id, verdict.result, verdict.reason, verdict.transformation, verdict.override_note ?? null, verdict.computed_at);
  }

  listVerdicts(artifact_id?: string): CompatibilityVerdict[] {
    const sql = artifact_id ? "SELECT * FROM compatibility_verdicts WHERE artifact_id = ? ORDER BY harness_id" : "SELECT * FROM compatibility_verdicts ORDER BY artifact_id,harness_id";
    return (artifact_id ? this.db.query(sql).all(artifact_id) : this.db.query(sql).all()) as CompatibilityVerdict[];
  }

  saveDeployment(record: DeploymentRecord): void {
    this.db.query("INSERT OR REPLACE INTO deployment_records VALUES (?,?,?,?,?,?,?)").run(
      record.id,
      record.harness_id,
      record.scope,
      json.stringify(record.plan_snapshot),
      record.applied_at,
      json.stringify(record.operations),
      record.prior_state_ref
    );
  }

  getDeployment(id: string): DeploymentRecord | null {
    const row = this.db.query("SELECT * FROM deployment_records WHERE id = ?").get(id) as Record<string, unknown> | null;
    return row ? rowToDeployment(row) : null;
  }

  listDeployments(harness_id?: string): DeploymentRecord[] {
    const rows = harness_id
      ? this.db.query("SELECT * FROM deployment_records WHERE harness_id = ? ORDER BY applied_at DESC").all(harness_id)
      : this.db.query("SELECT * FROM deployment_records ORDER BY applied_at DESC").all();
    return (rows as Record<string, unknown>[]).map(rowToDeployment);
  }

  saveLoadout(loadout: Loadout): void {
    this.db.query("INSERT OR REPLACE INTO loadouts VALUES (?,?,?,?,?)").run(loadout.id, loadout.name, loadout.description ?? null, json.stringify(loadout.members), loadout.updated_at);
  }

  getLoadout(nameOrId: string): Loadout | null {
    const row = this.db.query("SELECT * FROM loadouts WHERE id = ? OR name = ?").get(nameOrId, nameOrId) as Record<string, unknown> | null;
    return row ? { ...row, members: json.parse(row.members as string) } as Loadout : null;
  }

  listLoadouts(): Loadout[] {
    return (this.db.query("SELECT * FROM loadouts ORDER BY name").all() as Record<string, unknown>[]).map((row) => ({ ...row, members: json.parse(row.members as string) }) as Loadout);
  }

  savePipeline(pipeline: Pipeline): void {
    this.db.query("INSERT OR REPLACE INTO pipelines VALUES (?,?,?,?,?,?,?)").run(pipeline.id, pipeline.name, pipeline.use_case, pipeline.directive, pipeline.origin, json.stringify(pipeline.members), pipeline.updated_at);
  }

  listPipelines(): Pipeline[] {
    return (this.db.query("SELECT * FROM pipelines ORDER BY name").all() as Record<string, unknown>[]).map((row) => ({ ...row, members: json.parse(row.members as string) }) as Pipeline);
  }

  saveGuidance(guidance: GuidanceFile): void {
    this.db.query("INSERT OR REPLACE INTO guidance_files VALUES (?,?,?,?,?,?)").run(guidance.id, guidance.scope, guidance.harness_id ?? null, guidance.body, guidance.managed_section, guidance.updated_at);
  }

  saveFinding(finding: AuditFinding): void {
    this.db.query("INSERT OR REPLACE INTO audit_findings VALUES (?,?,?,?,?,?)").run(finding.artifact_id, finding.auditor_id, finding.score, finding.severity, json.stringify(finding.findings), finding.evaluated_at);
  }

  listFindings(artifact_id?: string): AuditFinding[] {
    const rows = artifact_id
      ? this.db.query("SELECT * FROM audit_findings WHERE artifact_id = ?").all(artifact_id)
      : this.db.query("SELECT * FROM audit_findings").all();
    return (rows as Record<string, unknown>[]).map((row) => ({ ...row, findings: json.parse(row.findings as string) }) as AuditFinding);
  }

  saveProposal(proposal: EvaluationProposal): void {
    this.db.query("INSERT OR REPLACE INTO evaluation_proposals VALUES (?,?,?,?,?,?,?,?)").run(
      proposal.id,
      proposal.kind,
      json.stringify(proposal.payload),
      proposal.rationale,
      proposal.model,
      proposal.turns,
      proposal.accepted === null ? null : proposal.accepted ? 1 : 0,
      proposal.created_at
    );
  }

  listProposals(): EvaluationProposal[] {
    return (this.db.query("SELECT * FROM evaluation_proposals ORDER BY created_at DESC").all() as Record<string, unknown>[]).map((row) => ({
      ...row,
      payload: json.parse(row.payload as string),
      accepted: row.accepted === null ? null : Boolean(row.accepted)
    }) as EvaluationProposal);
  }
}

function rowToArtifact(row: Record<string, unknown>): Artifact {
  return {
    ...(row as unknown as Artifact),
    required_capabilities: json.parse(row.required_capabilities as string),
    risk_flags: json.parse(row.risk_flags as string),
    is_self_authored: Boolean(row.is_self_authored),
    locally_modified: Boolean(row.locally_modified)
  };
}

function rowToDeployment(row: Record<string, unknown>): DeploymentRecord {
  return {
    id: row.id as string,
    harness_id: row.harness_id as string,
    scope: row.scope as string,
    plan_snapshot: json.parse(row.plan_snapshot as string),
    applied_at: row.applied_at as string,
    operations: json.parse(row.operations as string),
    prior_state_ref: row.prior_state_ref as string | null
  };
}
