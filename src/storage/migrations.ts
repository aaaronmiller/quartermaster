// ─────────────────────────────────────────────────────────────
// Quartermaster — Database Migrations
// ─────────────────────────────────────────────────────────────

import type { Database } from 'bun:sqlite';

export interface Migration {
  version: number;
  name: string;
  up: string;
  down: string;
}

/**
 * Schema migration sequence.
 * Each migration is applied transactionally. The `PRAGMA user_version`
 * is updated to `version` only after a successful migration.
 */
export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial-schema',
    up: `
      CREATE TABLE IF NOT EXISTS artifacts (
        id            TEXT PRIMARY KEY,
        type          TEXT NOT NULL,
        name          TEXT NOT NULL,
        path          TEXT NOT NULL UNIQUE,
        hash          TEXT NOT NULL,
        size          INTEGER NOT NULL,
        metadata      TEXT DEFAULT '{}',
        source        TEXT NOT NULL,
        capabilities  TEXT DEFAULT '[]',
        importedAt    TEXT NOT NULL,
        updatedAt     TEXT NOT NULL,
        provenance    TEXT,
        pinnedRevision TEXT,
        localModifications INTEGER DEFAULT 0,
        riskFlags     TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
      CREATE INDEX IF NOT EXISTS idx_artifacts_hash ON artifacts(hash);
      CREATE INDEX IF NOT EXISTS idx_artifacts_updated ON artifacts(updatedAt);

      CREATE TABLE IF NOT EXISTS deployment_logs (
        id        TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        harness   TEXT NOT NULL,
        plan      TEXT NOT NULL,
        status    TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_deployment_harness ON deployment_logs(harness);
      CREATE INDEX IF NOT EXISTS idx_deployment_time ON deployment_logs(timestamp);

      CREATE TABLE IF NOT EXISTS loadouts (
        name      TEXT PRIMARY KEY,
        harnesses TEXT NOT NULL DEFAULT '[]',
        artifacts TEXT NOT NULL DEFAULT '[]',
        pipelines TEXT DEFAULT '[]',
        active    INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS pipelines (
        name       TEXT PRIMARY KEY,
        artifacts  TEXT NOT NULL DEFAULT '[]',
        directives TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS proposals (
        id         TEXT PRIMARY KEY,
        type       TEXT NOT NULL,
        content    TEXT NOT NULL,
        rationale  TEXT,
        status     TEXT NOT NULL DEFAULT 'pending',
        createdAt  TEXT NOT NULL,
        acceptedAt TEXT,
        rejectionReason TEXT
      );
    `,
    down: `
      DROP TABLE IF EXISTS proposals;
      DROP TABLE IF EXISTS pipelines;
      DROP TABLE IF EXISTS loadouts;
      DROP TABLE IF EXISTS deployment_logs;
      DROP TABLE IF EXISTS artifacts;
    `,
  },
  {
    version: 2,
    name: 'add-organizational-path',
    up: `
      ALTER TABLE artifacts ADD COLUMN organizationalPath TEXT NOT NULL DEFAULT '';
      CREATE INDEX IF NOT EXISTS idx_artifacts_orgpath ON artifacts(organizationalPath);
    `,
    down: `
      DROP INDEX IF EXISTS idx_artifacts_orgpath;
    `,
  },
  {
    version: 3,
    name: 'add-verdict-overrides',
    up: `
      CREATE TABLE IF NOT EXISTS verdict_overrides (
        artifactId TEXT NOT NULL,
        harness    TEXT NOT NULL,
        status     TEXT NOT NULL,
        note       TEXT NOT NULL,
        updatedAt  TEXT NOT NULL,
        PRIMARY KEY (artifactId, harness)
      );
      CREATE INDEX IF NOT EXISTS idx_verdict_overrides_harness ON verdict_overrides(harness);
    `,
    down: `
      DROP TABLE IF EXISTS verdict_overrides;
    `,
  },
  {
    version: 4,
    name: 'add-safety-findings-allowlist',
    up: `
      CREATE TABLE IF NOT EXISTS findings (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        artifactId   TEXT NOT NULL,
        source       TEXT NOT NULL,
        severity     TEXT NOT NULL,
        description  TEXT NOT NULL,
        recommendation TEXT,
        createdAt    TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_findings_artifact ON findings(artifactId);
      CREATE TABLE IF NOT EXISTS allowlist (
        kind     TEXT NOT NULL,
        value    TEXT NOT NULL,
        reason   TEXT NOT NULL DEFAULT '',
        addedAt  TEXT NOT NULL,
        PRIMARY KEY (kind, value)
      );
      CREATE TABLE IF NOT EXISTS safety_overrides (
        artifactId TEXT NOT NULL PRIMARY KEY,
        note       TEXT NOT NULL,
        createdAt  TEXT NOT NULL
      );
    `,
    down: `
      DROP TABLE IF EXISTS findings;
      DROP TABLE IF EXISTS allowlist;
      DROP TABLE IF EXISTS safety_overrides;
    `,
  },
];

const CURRENT_VERSION = MIGRATIONS.reduce((max, m) => Math.max(max, m.version), 0);

/**
 * Run all pending migrations against the database.
 * Uses `PRAGMA user_version` to track schema version.
 * Migrations are applied in sequential order within a transaction.
 * On failure, the entire migration batch is rolled back.
 */
export function runMigrations(db: Database): void {
  const currentVersion = db.prepare('PRAGMA user_version').get() as { user_version: number };
  const version = currentVersion?.user_version ?? 0;

  if (version >= CURRENT_VERSION) {
    return; // Schema is up to date
  }

  const pending = MIGRATIONS.filter((m) => m.version > version).sort(
    (a, b) => a.version - b.version,
  );

  if (pending.length === 0) return;

  // Run all pending migrations in a single transaction
  const run = db.transaction(() => {
    for (const migration of pending) {
      try {
        db.run(migration.up);
        db.run(`PRAGMA user_version = ${migration.version}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new MigrationError(
          `Migration v${migration.version} ("${migration.name}") failed: ${msg}`,
          migration.version,
          migration.name,
        );
      }
    }
  });

  try {
    run();
  } catch (err) {
    if (err instanceof MigrationError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    throw new MigrationError(`Migration batch failed: ${msg}`, -1, 'batch');
  }
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly version: number,
    public readonly name: string,
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}
