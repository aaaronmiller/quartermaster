---
date: 2026-06-28
ver: 2.0.0
author: quartermaster-data-model
tags: [quartermaster, data-model, sqlite, schema, bun]
---

# Quartermaster — Data Model

> Full data model for the Quartermaster catalog, including all SQLite tables, indexes, relationships, access patterns, and migration strategy.

## 1. Storage Engine

SQLite via `bun:sqlite`. Embedded, zero external service, no native build step. All catalog, configuration, and history data is stored locally.

## 2. Schema Design

### 2.1 Sources

```sql
CREATE TABLE sources (
    id                TEXT PRIMARY KEY,
    kind              TEXT NOT NULL,          -- git | git_subdir | marketplace | local | self
    reference         TEXT,                   -- repo url, path, or marketplace id
    ref_branch        TEXT,
    imported_revision TEXT,                   -- revision at import time
    pin_revision      TEXT,                   -- non-null means pinned
    updated_at        TEXT NOT NULL
);
```

Records the origin of every artifact. Supports four kinds of upstream sources plus self-authored artifacts. Pin support prevents sync from advancing a source.

### 2.2 Artifacts

```sql
CREATE TABLE artifacts (
    id                    TEXT PRIMARY KEY,
    type                  TEXT NOT NULL,       -- skill | plugin | agent | hook | mcp | command | output_style | script
    name                  TEXT NOT NULL,
    description           TEXT,
    version               TEXT,
    org_path              TEXT NOT NULL,       -- library organizational subfolder path
    abs_path              TEXT NOT NULL,       -- on-disk location in the library
    content_hash          TEXT NOT NULL,       -- for incremental scan and local-mod detection
    required_capabilities TEXT NOT NULL,       -- json array, e.g. ["hooks"], with optional dialect
    risk_flags            TEXT NOT NULL,       -- json array, e.g. ["bundled_script","network"]
    source_id             TEXT NOT NULL REFERENCES sources(id),
    is_self_authored      INTEGER NOT NULL DEFAULT 0,
    locally_modified      INTEGER NOT NULL DEFAULT 0,
    updated_at            TEXT NOT NULL
);
```

Central entity — every artifact in the library. The `org_path` preserves the developer's organizational subfolder hierarchy, independent of how any harness requires layout. `content_hash` enables incremental rescan and local modification detection. `required_capabilities` stores inferred capabilities as a JSON array with optional dialect qualifiers.

### 2.3 Verdicts

```sql
CREATE TABLE verdicts (
    artifact_id    TEXT NOT NULL REFERENCES artifacts(id),
    harness_id     TEXT NOT NULL,              -- profile id
    result         TEXT NOT NULL,              -- deployable | transform | incompatible
    reason         TEXT,
    transformation TEXT,                       -- e.g. flatten, translate:mcp, none
    override_note  TEXT,                       -- non-null means manual override
    computed_at    TEXT NOT NULL,
    PRIMARY KEY (artifact_id, harness_id)
);
```

Cached compatibility verdicts. Computed as a pure function from artifact required capabilities and harness profile capabilities. Cached in this table and recomputed when artifact `content_hash` or profile changes. Manual overrides are stored as non-null `override_note`.

### 2.4 Deployments

```sql
CREATE TABLE deployments (
    id          TEXT PRIMARY KEY,
    harness_id  TEXT NOT NULL,
    scope       TEXT,                          -- json describing subset scope
    plan        TEXT NOT NULL,                 -- json snapshot of the applied plan
    applied_at  TEXT NOT NULL
);
```

Record of each applied deployment. The `plan` JSON snapshot captures exactly what was done, enabling reversal to the prior state.

### 2.5 Deployment Operations

```sql
CREATE TABLE deployment_ops (
    deployment_id   TEXT NOT NULL REFERENCES deployments(id),
    seq             INTEGER NOT NULL,
    op              TEXT NOT NULL,             -- create | replace | remove
    target_path     TEXT NOT NULL,
    method          TEXT NOT NULL,             -- link | copy | write_config
    prior_state_ref TEXT,                      -- path to captured prior content for reversal
    PRIMARY KEY (deployment_id, seq)
);
```

Individual operations within a deployment. Each op captures prior state before mutation, enabling granular reversal. Sequential ordering ensures replay correctness.

### 2.6 Indexes

```sql
CREATE INDEX idx_artifacts_type ON artifacts(type);
CREATE INDEX idx_artifacts_caps ON artifacts(required_capabilities);
CREATE INDEX idx_verdicts_harness ON verdicts(harness_id, result);
```

### 2.7 Loadouts

```sql
CREATE TABLE loadouts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,          -- e.g. coding, general, business
    description TEXT,
    updated_at  TEXT NOT NULL
);
```

Named activation profiles — coding, general, business, or any developer-defined set of artifacts and pipelines.

### 2.8 Loadout Members

```sql
CREATE TABLE loadout_members (
    loadout_id  TEXT NOT NULL REFERENCES loadouts(id),
    member_kind TEXT NOT NULL,          -- artifact | pipeline
    member_id   TEXT NOT NULL,
    PRIMARY KEY (loadout_id, member_kind, member_id)
);
```

Maps loadouts to their constituent artifacts and pipelines. Both kinds share the same membership table.

### 2.9 Loadout Assignments

```sql
CREATE TABLE loadout_assignments (
    harness_id  TEXT NOT NULL,          -- profile id
    loadout_id  TEXT NOT NULL REFERENCES loadouts(id),
    active      INTEGER NOT NULL DEFAULT 1,
    assigned_at TEXT NOT NULL,
    PRIMARY KEY (harness_id)
);
```

Which loadout is active on which harness. A harness can have at most one active loadout. The `active` flag supports soft deactivation.

### 2.10 Pipelines

```sql
CREATE TABLE pipelines (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    use_case    TEXT,                   -- the directive's intent
    directive   TEXT NOT NULL,          -- text injected into guidance files
    origin      TEXT NOT NULL,          -- hand | agentic
    updated_at  TEXT NOT NULL
);
```

Named groupings of skills. The `directive` is the text injected into harness guidance files. Origin tracks whether a pipeline was hand-authored or agentic-proposed.

### 2.11 Pipeline Members

```sql
CREATE TABLE pipeline_members (
    pipeline_id TEXT NOT NULL REFERENCES pipelines(id),
    seq         INTEGER NOT NULL,
    artifact_id TEXT NOT NULL REFERENCES artifacts(id),
    PRIMARY KEY (pipeline_id, seq)
);
```

Ordered members of a pipeline. The `seq` field establishes ordering within the pipeline, which is significant for the directive generated and for the optional composition module.

### 2.12 Guidance Files

```sql
CREATE TABLE guidance_files (
    id              TEXT PRIMARY KEY,   -- 'canonical' or a per-harness id
    scope           TEXT NOT NULL,      -- canonical | harness
    harness_id      TEXT,               -- null for canonical
    body            TEXT NOT NULL,      -- developer-authored content
    managed_section TEXT,               -- generated, delimited
    updated_at      TEXT NOT NULL
);
```

Canonical and per-harness guidance files. The canonical file is the single source of truth. Per-harness records contain the translated version with pipeline directives injected into the delimited managed section.

### 2.13 Auditors

```sql
CREATE TABLE auditors (
    id            TEXT PRIMARY KEY,     -- e.g. skillscan
    invocation    TEXT NOT NULL,        -- command template
    stages        TEXT NOT NULL,        -- json: e.g. ["static","predict","sandbox"]
    parser        TEXT NOT NULL,        -- how to normalize output
    enabled       INTEGER NOT NULL DEFAULT 1
);
```

Registered external safety scanners. Each auditor defines its invocation command template, which stages to run, and how to parse/normalize its output. Default: SkillScan.

### 2.14 Audit Findings

```sql
CREATE TABLE audit_findings (
    artifact_id  TEXT NOT NULL REFERENCES artifacts(id),
    auditor_id   TEXT NOT NULL REFERENCES auditors(id),
    score        REAL,                  -- normalized 0-100 safety score
    severity     TEXT,                  -- info | low | medium | high | critical
    findings     TEXT NOT NULL,         -- json detail
    evaluated_at TEXT NOT NULL,
    PRIMARY KEY (artifact_id, auditor_id)
);
```

Safety assessment results per artifact per auditor. The `score` is a normalized 0-100 safety score. The deployment gate checks this score against a configurable threshold.

### 2.15 Evaluation Proposals

```sql
CREATE TABLE eval_proposals (
    id          TEXT PRIMARY KEY,
    kind        TEXT NOT NULL,          -- grade | comparison | loadout | pipeline
    payload     TEXT NOT NULL,          -- json proposal body
    rationale   TEXT,
    model       TEXT,                   -- which model produced it
    turns       INTEGER,                -- multi-turn budget used
    accepted    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
);
```

Outputs of the agentic evaluation engine. Every proposal requires explicit developer acceptance before it can affect catalog state or deployments.

## 3. Relationships Entity-Relationship Diagram

```
sources 1---* artifacts *---* verdicts *---1 (implicit) harness_profiles (YAML)
              |
              *---* audit_findings *---1 auditors
              |
              *---* pipeline_members *---1 pipelines *---* loadout_members *---* loadouts
                                                                                  |
                                                                        loadout_assignments
                                                                                  |
                                                                         harness_profiles (YAML)
              |
              *---* deployments 1---* deployment_ops

guidance_files (canonical + per-harness)

harness_profiles -- YAML files, not SQLite
  profiles/claude-code.yaml
  profiles/codex.yaml
  profiles/antigravity.yaml
  profiles/opencode.yaml
  (user extensions in config directory)
```

## 4. Access Patterns

| Query Pattern | Frequency | Implementation |
|---------------|-----------|----------------|
| List all artifacts by type | High | Indexed on `artifacts.type` |
| Filter artifacts by capability | High | Indexed on `artifacts.required_capabilities` (JSON array, search via JSON_EACH or LIKE) |
| Search artifacts by name, description, or path | High | Full-text search or LIKE on `name`, `description`, `org_path` |
| Get verdict for one artifact on one harness | High | Primary key lookup on `verdicts(artifact_id, harness_id)` |
| Get all verdicts for a harness (matrix row) | High | Indexed on `verdicts(harness_id, result)` |
| Detect drift between deployed and library | On status check | Compare target file hash against `artifacts.content_hash` recorded at deploy time |
| Reverse a deployment | Occasional, must be exact | Replay `deployment_ops` in reverse using `prior_state_ref` |
| Incremental rescan | Every scan | Compare on-disk content hash to stored `artifacts.content_hash`; touch only changed rows |
| List active artifacts for a harness loadout | On deploy/status | Join `loadout_assignments` → `loadout_members` → `artifacts`, filtered by `verdicts.result = 'deployable'` for the harness |
| List pipelines in a loadout | On deploy | Join `loadout_members` where `member_kind = 'pipeline'` |
| Count active artifacts per harness | On status | Aggregate query on loadout membership + verdict filter |

## 5. Harness Profiles (Not SQLite)

Harness profiles are stored as YAML files, not in SQLite, so they are human-editable, version-controllable, and shareable.

**Built-in profiles location**: `profiles/` in the package directory.
- `profiles/claude-code.yaml`
- `profiles/codex.yaml`
- `profiles/antigravity.yaml`
- `profiles/opencode.yaml`

**User profile location**: Under the config directory (e.g., `~/.config/quartermaster/profiles/`).

**Profile schema**:
```yaml
id: <unique-id>
name: <human-readable-name>
supports:
  types: [list of artifact types]
  capabilities:
    <capability-id>: { dialect: <dialect-id> }
layout:
  <artifact-type>:
    scope:
      global: <path>
      project: <path>
    dirname: <directory-name>
    flat: <boolean>
    format: <config-format-id>
```

## 6. Migration Strategy

- Schema versions are tracked in a `meta` table with a single `schema_version` row.
- Migrations are ordered, forward-only SQL applied on startup when the stored version is behind the binary's expected version.
- Each migration is wrapped in a transaction so a failed migration leaves the prior version intact.
- Migration files stored in `src/db/migrations/` numbered sequentially.

## 7. Entity Count and Summary

| Entity | Purpose | Key Relationships |
|--------|---------|-------------------|
| sources (14 fields) | Artifact origin tracking | 1→N artifacts |
| artifacts (14 fields) | Central artifact record | N→1 sources; N→M verdicts; N→M audit_findings; N→M loadout_members; N→1 pipeline_members |
| verdicts (6 fields) | Per-artifact per-harness compatibility | Composite PK linking artifact↔harness |
| deployments (5 fields) | Applied deployment records | 1→N deployment_ops |
| deployment_ops (6 fields) | Granular deployment operations | N→1 deployments |
| loadouts (4 fields) | Named activation profiles | N→M loadout_members; 1→N loadout_assignments |
| loadout_members (3 fields) | Loadout membership | N→1 loadouts; references artifacts and pipelines |
| loadout_assignments (4 fields) | Harness→loadout mapping | N→1 loadouts; 1 per harness |
| pipelines (5 fields) | Named skill groupings | 1→N pipeline_members; N→M loadout_members |
| pipeline_members (3 fields) | Ordered pipeline membership | N→1 pipelines; N→1 artifacts |
| guidance_files (6 fields) | Canonical and per-harness guidance | References harness profiles |
| auditors (5 fields) | Registered safety scanners | 1→N audit_findings |
| audit_findings (6 fields) | Safety assessment results | N→1 artifacts; N→1 auditors |
| eval_proposals (7 fields) | Agentic evaluation outputs | Produced from artifacts; may create loadouts/pipelines |
