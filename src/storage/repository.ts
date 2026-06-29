// ─────────────────────────────────────────────────────────────
// Quartermaster — SQLite Repository
// ─────────────────────────────────────────────────────────────

import { Database } from 'bun:sqlite';
import type {
  Artifact,
  ArtifactType,
  DeploymentRecord,
  EvaluationProposal,
  LoadoutDefinition,
  PipelineDefinition,
} from '@core/types';
import { MigrationError, runMigrations } from './migrations';

export interface ListArtifactOptions {
  type?: ArtifactType;
  root?: string;
}

export interface RepositoryConfig {
  /** Path to the SQLite database file. Defaults to ~/.quartermaster/catalog.db */
  dbPath?: string;
}

/**
 * Default database path.
 */
function defaultDbPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '~';
  return `${home}/.quartermaster/catalog.db`;
}

/**
 * SQLite-backed repository for Quartermaster's catalog,
 * deployment logs, loadouts, pipelines, and proposals.
 *
 * Uses WAL mode for concurrent safety.
 * Runs migrations on first construction.
 */
export class Repository {
  public db: Database;
  private basePath: string;

  constructor(config?: RepositoryConfig) {
    this.basePath = config?.dbPath ?? defaultDbPath();

    // Ensure directory exists
    const dir = this.basePath.substring(0, this.basePath.lastIndexOf('/'));
    try {
      require('fs').mkdirSync(dir, { recursive: true });
    } catch {
      // directory may already exist
    }

    this.db = new Database(this.basePath);

    // WAL mode for concurrent access safety
    this.db.run('PRAGMA journal_mode = WAL');
    this.db.run('PRAGMA foreign_keys = ON');

    // Run pending migrations
    try {
      runMigrations(this.db);
    } catch (err) {
      this.db.close();
      throw err;
    }
  }

  // ── Artifact CRUD ─────────────────────────────────────────

  /** Insert or update an artifact. */
  upsertArtifact(a: Artifact): void {
    const stmt = this.db.prepare(`
      INSERT INTO artifacts (id, type, name, path, hash, size, metadata, source, capabilities,
                             importedAt, updatedAt, provenance, pinnedRevision, localModifications, riskFlags)
      VALUES ($id, $type, $name, $path, $hash, $size, $metadata, $source, $capabilities,
              $importedAt, $updatedAt, $provenance, $pinnedRevision, $localModifications, $riskFlags)
      ON CONFLICT(path) DO UPDATE SET
        id = $id, type = $type, name = $name, hash = $hash, size = $size,
        metadata = $metadata, source = $source, capabilities = $capabilities,
        updatedAt = $updatedAt, provenance = $provenance,
        pinnedRevision = $pinnedRevision, localModifications = $localModifications,
        riskFlags = $riskFlags
    `);

    stmt.run(
      a.id,
      a.type,
      a.name,
      a.path,
      a.hash,
      a.size,
      JSON.stringify(a.metadata),
      JSON.stringify(a.source),
      JSON.stringify(a.capabilities),
      a.importedAt,
      a.updatedAt,
      a.provenance ?? null,
      a.pinnedRevision ?? null,
      a.localModifications ? 1 : 0,
      a.riskFlags ? JSON.stringify(a.riskFlags) : null,
    );
  }

  /** Get an artifact by ID. Returns null if not found. */
  getArtifact(id: string): Artifact | null {
    const row = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? rowToArtifact(row) : null;
  }

  /** Get an artifact by filesystem path. */
  getArtifactByPath(path: string): Artifact | null {
    const row = this.db.prepare('SELECT * FROM artifacts WHERE path = ?').get(path) as Record<
      string,
      unknown
    > | null;
    return row ? rowToArtifact(row) : null;
  }

  /** List all artifacts, optionally filtered. */
  listArtifacts(opts?: ListArtifactOptions): Artifact[] {
    let sql = 'SELECT * FROM artifacts';
    const params: string[] = [];

    if (opts?.type) {
      sql += ' WHERE type = ?';
      params.push(opts.type);
    }

    sql += ' ORDER BY name ASC';

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToArtifact);
  }

  /** Delete an artifact by ID. Returns true if a row was deleted. */
  deleteArtifact(id: string): boolean {
    const result = this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
    return (result.changes ?? 0) > 0;
  }

  /** Search artifacts by free-text query (matches name, path, and metadata). */
  searchArtifacts(query: string): Artifact[] {
    const like = `%${query}%`;
    const rows = this.db
      .prepare(
        `SELECT * FROM artifacts WHERE name LIKE ? OR path LIKE ? OR metadata LIKE ? ORDER BY name ASC`,
      )
      .all(like, like, like) as Record<string, unknown>[];
    return rows.map(rowToArtifact);
  }

  /** Get total artifact count. */
  totalArtifactCount(): number {
    const row = this.db.prepare('SELECT COUNT(*) as cnt FROM artifacts').get() as {
      cnt: number;
    };
    return row?.cnt ?? 0;
  }

  /** Check if a path is already cataloged. */
  hasPath(path: string): boolean {
    const row = this.db.prepare('SELECT 1 FROM artifacts WHERE path = ?').get(path);
    return row !== undefined;
  }

  /** Get the hash for a known path. */
  getHashByPath(path: string): string | null {
    const row = this.db.prepare('SELECT hash FROM artifacts WHERE path = ?').get(path) as {
      hash: string;
    } | null;
    return row?.hash ?? null;
  }

  // ── Deployment Logs ───────────────────────────────────────

  /** Record a deployment attempt. */
  recordDeployment(record: DeploymentRecord): void {
    this.db
      .prepare(
        `INSERT INTO deployment_logs (id, timestamp, harness, plan, status)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(record.id, record.timestamp, record.harness, JSON.stringify(record.plan), record.status);
  }

  /** List deployment records, optionally filtered by harness. */
  getDeployments(harness?: string): DeploymentRecord[] {
    let sql = 'SELECT * FROM deployment_logs';
    const params: string[] = [];

    if (harness) {
      sql += ' WHERE harness = ?';
      params.push(harness);
    }

    sql += ' ORDER BY timestamp DESC';

    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map((r) => ({
      id: r.id as string,
      timestamp: r.timestamp as string,
      harness: r.harness as string,
      plan: JSON.parse(r.plan as string),
      status: r.status as DeploymentRecord['status'],
    }));
  }

  /** Get the latest deployment for a harness, or null. */
  getLatestDeployment(harness: string): DeploymentRecord | null {
    const row = this.db
      .prepare('SELECT * FROM deployment_logs WHERE harness = ? ORDER BY timestamp DESC LIMIT 1')
      .get(harness) as Record<string, unknown> | null;

    if (!row) return null;

    return {
      id: row.id as string,
      timestamp: row.timestamp as string,
      harness: row.harness as string,
      plan: JSON.parse(row.plan as string),
      status: row.status as DeploymentRecord['status'],
    };
  }

  // ── Loadouts ──────────────────────────────────────────────

  /** Create or update a loadout definition. */
  upsertLoadout(def: LoadoutDefinition): void {
    this.db
      .prepare(
        `INSERT INTO loadouts (name, harnesses, artifacts, pipelines, active)
         VALUES ($name, $harnesses, $artifacts, $pipelines, $active)
         ON CONFLICT(name) DO UPDATE SET
           harnesses = $harnesses, artifacts = $artifacts,
           pipelines = $pipelines, active = $active`,
      )
      .run(
        def.name,
        JSON.stringify(def.harnesses),
        JSON.stringify(def.artifacts),
        JSON.stringify(def.pipelines),
        def.active ? 1 : 0,
      );
  }

  /** Get all loadouts. */
  listLoadouts(): LoadoutDefinition[] {
    const rows = this.db.prepare('SELECT * FROM loadouts').all() as Record<string, unknown>[];
    return rows.map((r) => ({
      name: r.name as string,
      harnesses: JSON.parse(r.harnesses as string),
      artifacts: JSON.parse(r.artifacts as string),
      pipelines: r.pipelines ? JSON.parse(r.pipelines as string) : [],
      active: (r.active as number) === 1,
    }));
  }

  /** Get a loadout by name. */
  getLoadout(name: string): LoadoutDefinition | null {
    const row = this.db.prepare('SELECT * FROM loadouts WHERE name = ?').get(name) as Record<
      string,
      unknown
    > | null;
    if (!row) return null;
    return {
      name: row.name as string,
      harnesses: JSON.parse(row.harnesses as string),
      artifacts: JSON.parse(row.artifacts as string),
      pipelines: row.pipelines ? JSON.parse(row.pipelines as string) : [],
      active: (row.active as number) === 1,
    };
  }

  /** Delete a loadout by name. */
  deleteLoadout(name: string): boolean {
    const result = this.db.prepare('DELETE FROM loadouts WHERE name = ?').run(name);
    return (result.changes ?? 0) > 0;
  }

  /** Activate a loadout for a harness (deactivates others for same harness). */
  activateLoadout(_harness: string, name: string): void {
    const run = this.db.transaction(() => {
      // Deactivate all loadouts for this harness
      const all = this.listLoadouts();
      for (const l of all) {
        if (l.harnesses.includes(_harness) && l.active) {
          this.db.prepare('UPDATE loadouts SET active = 0 WHERE name = ?').run(l.name);
        }
      }
      // Activate the target loadout
      this.db.prepare('UPDATE loadouts SET active = 1 WHERE name = ?').run(name);
    });
    run();
  }

  // ── Pipelines ─────────────────────────────────────────────

  /** Create or update a pipeline definition. */
  upsertPipeline(p: PipelineDefinition): void {
    this.db
      .prepare(
        `INSERT INTO pipelines (name, artifacts, directives)
         VALUES ($name, $artifacts, $directives)
         ON CONFLICT(name) DO UPDATE SET
           artifacts = $artifacts, directives = $directives`,
      )
      .run(p.name, JSON.stringify(p.artifacts), JSON.stringify(p.directives));
  }

  /** Get a pipeline by name. */
  getPipeline(name: string): PipelineDefinition | null {
    const row = this.db.prepare('SELECT * FROM pipelines WHERE name = ?').get(name) as Record<
      string,
      unknown
    > | null;
    if (!row) return null;
    return {
      name: row.name as string,
      artifacts: safeParseJSON(row.artifacts as string, []),
      directives: safeParseJSON(row.directives as string, {}),
    };
  }

  /** List all pipelines. */
  listPipelines(): PipelineDefinition[] {
    const rows = this.db
      .prepare('SELECT * FROM pipelines ORDER BY name ASC')
      .all() as Record<string, unknown>[];
    return rows.map((r) => ({
      name: r.name as string,
      artifacts: safeParseJSON(r.artifacts as string, []),
      directives: safeParseJSON(r.directives as string, {}),
    }));
  }

  /** Delete a pipeline by name. Returns true if a row was deleted. */
  deletePipeline(name: string): boolean {
    const result = this.db.prepare('DELETE FROM pipelines WHERE name = ?').run(name);
    return (result.changes ?? 0) > 0;
  }

  // ── Proposals ─────────────────────────────────────────────

  /** Create or update an evaluation proposal. */
  saveProposal(p: EvaluationProposal): void {
    this.db
      .prepare(
        `INSERT INTO proposals (id, type, content, rationale, status, createdAt, acceptedAt, rejectionReason)
         VALUES ($id, $type, $content, $rationale, $status, $createdAt, $acceptedAt, $rejectionReason)
         ON CONFLICT(id) DO UPDATE SET
           type = $type, content = $content, rationale = $rationale, status = $status,
           acceptedAt = $acceptedAt, rejectionReason = $rejectionReason`,
      )
      .run(
        p.id,
        p.type,
        JSON.stringify(p.content),
        p.rationale,
        p.status,
        p.createdAt,
        p.acceptedAt ?? null,
        p.rejectionReason ?? null,
      );
  }

  /** Get a proposal by ID. */
  getProposal(id: string): EvaluationProposal | null {
    const row = this.db.prepare('SELECT * FROM proposals WHERE id = ?').get(id) as Record<
      string,
      unknown
    > | null;
    return row ? rowToProposal(row) : null;
  }

  /** List proposals, optionally filtered by status. */
  listProposals(status?: EvaluationProposal['status']): EvaluationProposal[] {
    let sql = 'SELECT * FROM proposals';
    const params: string[] = [];
    if (status) {
      sql += ' WHERE status = ?';
      params.push(status);
    }
    sql += ' ORDER BY createdAt DESC';
    const rows = this.db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToProposal);
  }

  /** Delete a proposal by ID. Returns true if a row was deleted. */
  deleteProposal(id: string): boolean {
    const result = this.db.prepare('DELETE FROM proposals WHERE id = ?').run(id);
    return (result.changes ?? 0) > 0;
  }

  // ── Raw Queries (for search/indexing) ─────────────────────

  /** Execute a raw SQL SELECT and return all matching rows. */
  queryRaw(sql: string, params?: string[]): Record<string, unknown>[] {
    const stmt = this.db.prepare(sql);
    return (params && params.length > 0 ? stmt.all(...params) : stmt.all()) as Record<
      string,
      unknown
    >[];
  }

  /** Execute a raw SQL SELECT and return a single row. */
  queryRow<T>(sql: string, params?: string[]): T | null {
    const stmt = this.db.prepare(sql);
    return (params && params.length > 0 ? stmt.get(...params) : stmt.get()) as T | null;
  }

  // ── Misc ──────────────────────────────────────────────────

  /** Verify database integrity. */
  integrityCheck(): string[] {
    const rows = this.db.prepare('PRAGMA integrity_check').all() as Array<{
      integrity_check: string;
    }>;
    return rows.map((r) => r.integrity_check);
  }

  /** Close the database connection. */
  close(): void {
    this.db.close();
  }
}

// ── Helpers ─────────────────────────────────────────────────

function rowToArtifact(row: Record<string, unknown>): Artifact {
  const base = {
    id: row.id as string,
    type: row.type as Artifact['type'],
    name: row.name as string,
    path: row.path as string,
    hash: row.hash as string,
    size: row.size as number,
    metadata: safeParseJSON(row.metadata as string | null | undefined, {}),
    source: safeParseJSON(row.source as string),
    capabilities: safeParseJSON(row.capabilities as string, []) as Artifact['capabilities'],
    importedAt: row.importedAt as string,
    updatedAt: row.updatedAt as string,
    provenance: (row.provenance as string) ?? '',
    pinnedRevision: (row.pinnedRevision as string) ?? undefined,
    localModifications: (row.localModifications as number) === 1,
  };

  const riskFlags = row.riskFlags
    ? safeParseJSON<Artifact['riskFlags']>(row.riskFlags as string, [])
    : undefined;

  return { ...base, ...(riskFlags !== undefined ? { riskFlags } : {}) } as Artifact;
}

function rowToProposal(row: Record<string, unknown>): EvaluationProposal {
  const base = {
    id: row.id as string,
    type: row.type as EvaluationProposal['type'],
    content: safeParseJSON(row.content as string),
    rationale: (row.rationale as string) ?? '',
    status: row.status as EvaluationProposal['status'],
    createdAt: row.createdAt as string,
  };
  const acceptedAt = (row.acceptedAt as string) ?? undefined;
  const rejectionReason = (row.rejectionReason as string) ?? undefined;
  return {
    ...base,
    ...(acceptedAt !== undefined ? { acceptedAt } : {}),
    ...(rejectionReason !== undefined ? { rejectionReason } : {}),
  };
}

function safeParseJSON<T>(raw: string | null | undefined, fallback?: T): T {
  if (!raw) return (fallback ?? {}) as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return (fallback ?? {}) as T;
  }
}
