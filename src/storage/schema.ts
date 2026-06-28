import { Database } from "bun:sqlite";

export function migrate(db: Database): void {
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      reference TEXT NOT NULL,
      ref_branch TEXT,
      imported_revision TEXT,
      pin_revision TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      version TEXT,
      org_path TEXT NOT NULL,
      abs_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      required_capabilities TEXT NOT NULL,
      risk_flags TEXT NOT NULL,
      source_id TEXT NOT NULL REFERENCES sources(id),
      is_self_authored INTEGER NOT NULL,
      locally_modified INTEGER NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_artifacts_type ON artifacts(type);
    CREATE INDEX IF NOT EXISTS idx_artifacts_source ON artifacts(source_id);
    CREATE TABLE IF NOT EXISTS compatibility_verdicts (
      artifact_id TEXT NOT NULL,
      harness_id TEXT NOT NULL,
      result TEXT NOT NULL,
      reason TEXT,
      transformation TEXT,
      override_note TEXT,
      computed_at TEXT NOT NULL,
      PRIMARY KEY (artifact_id, harness_id)
    );
    CREATE TABLE IF NOT EXISTS deployment_records (
      id TEXT PRIMARY KEY,
      harness_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      plan_snapshot TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      operations TEXT NOT NULL,
      prior_state_ref TEXT
    );
    CREATE TABLE IF NOT EXISTS loadouts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      members TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS loadout_assignments (
      harness_id TEXT PRIMARY KEY,
      loadout_id TEXT NOT NULL,
      active INTEGER NOT NULL,
      assigned_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pipelines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      use_case TEXT NOT NULL,
      directive TEXT NOT NULL,
      origin TEXT NOT NULL,
      members TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS guidance_files (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      harness_id TEXT,
      body TEXT NOT NULL,
      managed_section TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS audit_findings (
      artifact_id TEXT NOT NULL,
      auditor_id TEXT NOT NULL,
      score REAL NOT NULL,
      severity TEXT NOT NULL,
      findings TEXT NOT NULL,
      evaluated_at TEXT NOT NULL,
      PRIMARY KEY (artifact_id, auditor_id)
    );
    CREATE TABLE IF NOT EXISTS evaluation_proposals (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      payload TEXT NOT NULL,
      rationale TEXT NOT NULL,
      model TEXT NOT NULL,
      turns INTEGER NOT NULL,
      accepted INTEGER,
      created_at TEXT NOT NULL
    );
  `);
}

export function openCatalog(path = ".quartermaster/catalog.sqlite"): Database {
  const file = Bun.file(path);
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : ".";
  if (dir !== ".") {
    const fs = require("node:fs") as typeof import("node:fs");
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(file.name);
  migrate(db);
  return db;
}
