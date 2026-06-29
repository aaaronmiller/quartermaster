---
date: 2026-06-28
ver: 2.0.0
author: quartermaster-tasks
tags: [quartermaster, tasks, implementation, depth-v2]
---

# Quartermaster — Implementation Tasks v2

> Generated from spec.md v2.0 and plan.md v2.0 with full depth preservation.
> Each task carries the full implementation specification: interface contract, algorithm description, edge case catalog, error handling, and acceptance criteria — so no developer needs to re-read the design doc to implement correctly.

**Source coverage:** 42 FRs, 18 NFRs, 16 component modules, 8 user stories

---

## Phase 1: Data Layer and Core Type System

- [x] T001 Initialize Bun TypeScript project ✅
**Files:** `package.json`, `tsconfig.json`, `bun.lock`
**Source:** design.md §3, plan.md §1.3
**FRs:** none (infrastructure)

**Description:** Create a Bun TypeScript project targeting `bun build --compile` for distribution. `package.json` must specify `"type": "module"`, strict version pins for all dependencies, and a `"build"` script invoking `bun build --compile --target=bun-linux-x64 ./src/cli/index.ts`. `tsconfig.json` must enable `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`. Configure path aliases: `@core/*` → `src/core/*`, `@storage/*` → `src/storage/*`, `@cli/*` → `src/cli/*`, `@tui/*` → `src/tui/*`, `@web/*` → `src/web/*`, `@test/*` → `tests/*`.

**Dependencies:** None
**Acceptance:** `bun run build` exits 0 and produces a binary in `dist/`. `bun test` runs (even if zero tests). All path aliases resolve.

**Edge cases:** Missing `bun` at system level → error with instructions. Platform mismatch in build target → clear error message.
**Error handling:** If `bun` is not installed, error message directs to `https://bun.sh`. If `tsconfig.json` has existing settings, merge (don't overwrite) with conflict warning.

---

- [x] T002 Define core type system with full JSDoc ✅
**Files:** `src/core/types.ts`
**Source:** design.md §3, plan.md §1.1, spec.md FR-001–FR-142
**FRs:** all FRs reference these types

**Description:** Define every shared type in the system. `Artifact` (id: string, type: ArtifactType, name: string, path: string, hash: string, size: number, metadata: Record<string,unknown>, source: ArtifactSource, capabilities: Capability[], importedAt: string, updatedAt: string, provenance: string, pinnedRevision?: string, localModifications?: boolean, riskFlags?: RiskFlag[], loadouts?: string[]). `ArtifactType` enum: 'skill', 'agent', 'plugin', 'hook', 'script', 'mcp-config', 'slash-command', 'output-style'. `ArtifactSource` union: `{ kind: 'github', owner:string, repo:string, ref:string, subdir?:string } | { kind: 'git', url:string, ref:string } | { kind: 'marketplace', url:string } | { kind: 'local', path:string }`. `Capability` (type: string, dialect: string, metadata?: Record<string,unknown>). `Verdict` (status: 'deployable' | 'incompatible' | 'transform', reason: string, transformation?: string). `DeploymentOperation` (sourcePath: string, targetPath: string, method: 'link' | 'copy', transform?: string, priorState?: { contentHash: string; permissions: number }). `DeploymentPlan` (harness: string, operations: DeploymentOperation[], excluded: Array<{artifact: string; reason: string}>). `DeploymentRecord` (id: string, timestamp: string, harness: string, plan: DeploymentPlan, status: 'applied' | 'rolled-back' | 'failed'). `LoadoutDefinition` (name: string, harnesses: string[], artifacts: string[], pipelines: string[], active: boolean). `PipelineDefinition` (name: string, artifacts: string[], directives: Record<string,unknown>). `GuidanceDocument` (path: string, harness: string, managed: string, unmanaged: string, sections: Array<{name:string; content:string; managed:boolean}>). `RawEvaluation` (type: 'grade' | 'compare' | 'propose', input: unknown, output: unknown, model: string, timestamp: string). `SafetyFinding` (severity: 'low' | 'medium' | 'high' | 'critical', source: string, description: string, artifactId: string, recommendation: string). `ScanResult` (added: Artifact[], changed: Artifact[], removed: Artifact[], errors: Array<{path:string; error:string}>). `ChangeSet` (added: Artifact[], changed: Artifact[], removed: Artifact[], upstreamChanges: Array<{artifact:string; state:'unchanged'|'ahead'|'conflict'}>).

**NFRs:** NFR-030 (all data local), NFR-031 (no credentials in types)
**Dependencies:** T001
**Acceptance:** All types compile without error. No `any` usage in type definitions. All field types are correctly referenced. Full JSDoc on every type and every field.

---

- [x] T003 Implement SQLite repository with migrations ✅
**Files:** `src/storage/repository.ts`, `src/storage/migrations.ts`
**Source:** plan.md §2.1–2.3, spec.md FR-010
**FRs:** FR-010 (provenance recording), FR-070 (provenance surface)

**Description:** SQLite-backed repository using `bun:sqlite` with WAL mode for concurrent access safety. Schema tables: `artifacts` (id TEXT PK, type TEXT NOT NULL, name TEXT NOT NULL, path TEXT NOT NULL UNIQUE, hash TEXT NOT NULL, size INTEGER NOT NULL, metadata TEXT, source TEXT NOT NULL, capabilities TEXT, importedAt TEXT NOT NULL, updatedAt TEXT NOT NULL, provenance TEXT, pinnedRevision TEXT, localModifications INTEGER DEFAULT 0, riskFlags TEXT); `deployment_logs` (id TEXT PK, timestamp TEXT NOT NULL, harness TEXT NOT NULL, plan TEXT NOT NULL, status TEXT NOT NULL); `loadouts` (name TEXT PK, harnesses TEXT NOT NULL, artifacts TEXT NOT NULL, pipelines TEXT, active INTEGER DEFAULT 0); `pipelines` (name TEXT PK, artifacts TEXT NOT NULL, directives TEXT). Repository class exposes: `upsertArtifact(a: Artifact): void`, `getArtifact(id: string): Artifact | null`, `listArtifacts(opts?: { type?: ArtifactType; root?: string }): Artifact[]`, `deleteArtifact(id: string): boolean`, `searchArtifacts(query: string): Artifact[]`, `totalArtifactCount(): number`, `recordDeployment(record: DeploymentRecord): void`, `getDeployments(harness?: string): DeploymentRecord[]`, `createLoadout(def: LoadoutDefinition): void`, `activateLoadout(harness: string, name: string): void`, `close(): void`. Migration system tracks schema version via `PRAGMA user_version`. Migrations are sequential arrays of `{version: number; up: string; down: string}` objects. Run all pending migrations on first `Repository` construction.

**Edge cases:** Concurrent writes from multiple CLI invocations → WAL mode prevents locking. Corrupt DB file → `PRAGMA integrity_check` on open, error with recovery instructions. Schema version mismatch → apply migrations transactionally, roll back on failure. Large metadata (>1MB) → store compressed. UTF-8 path names → ensure TEXT columns use UTF-8 encoding. Empty database → create tables on first open.

**Error handling:** DB file not writable → error with current permissions and suggestion. Migration failure → roll back entire migration batch, report which migration failed and why.

**Dependencies:** T001, T002
**Acceptance:** `INSERT`, `SELECT`, `UPDATE`, `DELETE` all work. Migrations run idempotently (second open does not re-run). Schema version increments correctly. `PRAGMA integrity_check` passes after all operations.

---

## Phase 2: Catalog Engine

- [x] T004 Implement catalog scanner ✅
**Files:** `src/core/catalog/scanner.ts`
**Source:** design.md §4.1, plan.md §3.1, spec.md FR-001–FR-006
**FRs:** FR-001 (scan roots), FR-002 (preserve subfolder path), FR-003 (parse metadata), FR-004 (detect capabilities), FR-005 (incremental rescan), FR-006 (search/filter)

**Interface:**
```typescript
interface Scanner {
  scan(roots: string[], repo: Repository): Promise<ScanResult>;
  rescanIncremental(repo: Repository, since: Date): Promise<ScanResult>;
}
```

**Description:** Walk configured root directories recursively (max depth 100, skip `.git/`, `node_modules/`, hidden dirs by default). For each file encountered, determine artifact type using an ordered detector chain: (1) filename matches `hook-*` → hook; (2) `manifest.yaml` in parent dir → agent; (3) `package.json` with `"type"` field → plugin (read manifest to detect bundled components); (4) `.mcp.json` or `mcp-servers.json` → mcp-config (detect Single vs Multi server type); (5) `.md` with YAML frontmatter (starts with `---`) → skill (extract `name`, `description`, `tags`, `capabilities` from frontmatter); (6) `.py` → script; (7) files matching `.agent/**/*.md` or `.agent/**/*.json` → agent-config; (8) default → unrecognized (warn but skip). Parse metadata per type: for skills extract frontmatter (name, description, tags, grade, source fields); for plugins parse `package.json` fields; for hooks read first 10 lines for shebang and purpose comment. Compute SHA-256 content hash of file bytes. Incremental rescan compares current hash against stored hash in DB — only process artifacts whose hash changed or which are new. Return `ScanResult` with categorized arrays.

**Edge cases:** Symlink loops → track visited inode numbers (via `stat`), skip and warn on loop. Permission denied on subdirectory → log warning, continue scanning other roots. Binary files → detect by BOM/magic bytes, hash but skip type detection. Very deep nesting (>100) → stop and warn. File deleted during scan → catch ENOENT, warn, continue. Paths with special characters (spaces, unicode, emoji) → handle correctly. Extremely large files (>100MB) → warn and skip content analysis.

**Error handling:** Root does not exist → error listing root name. Glob pattern in root → expand before walk. Root is a file (not directory) → treat as single-file scan. Filesystem read error → log path + error, continue.

**NFRs:** NFR-001 (scan 1000 artifacts <10s full, <2s incremental)
**Dependencies:** T002, T003
**Acceptance:** Scan of `/home/cheta/.pi/agent/skills/` detects 60+ skills with correct types. Scan of a multi-root config with 3 roots works correctly. Rescan after adding one file returns exactly one `added`. Rescan after modifying a file returns exactly one `changed`. All metadata fields are populated for each detected type. Search by type, name, and capability returns matching artifacts.

---

- [x] T005 Implement capability inference ✅
**Files:** `src/core/catalog/capabilities.ts`
**Source:** design.md §4.2, plan.md §3.2, spec.md FR-004

**Interface:**
```typescript
function inferCapabilities(artifact: Artifact): Capability[];
function inferCapabilityDialect(artifact: Artifact, capabilityType: string): string;
function unionPluginCapabilities(manifest: Record<string,any>): Capability[];
```

**Description:** For each artifact type, map to required capabilities and dialects. Skill artifacts → `{ type: 'skill', dialect: 'agent-md' }` (also detect `grade: A` → `quality-assured` capability). Plugin artifacts → parse `package.json`'s `components` array, union each component's capabilities; detect if plugin bundles hooks (`capability: 'hooks'`), adds commands (`capability: 'commands'`), or adds MCP servers (`capability: 'mcp'`). Hook artifacts → `{ type: 'hooks' }`. MCP config artifacts → detect `SingleMcpServerDef` vs `ArrayMcpServerDef`, produce `{ type: 'mcp', dialect: config.kind }`. Script artifacts → `{ type: 'scripts' }`. Agent config artifacts → `{ type: 'agent-config' }`. Frontmatter `requires` field on skill artifacts can override/append inferred capabilities. Plugin capability union: read `components[].type` from manifest, map each component type to its capability set.

**Edge cases:** Missing manifest fields → use defaults. Circular plugin dependency → detect via visited set, warn. Unknown component type in manifest → log warning, include as `{ type: 'unknown', dialect: raw }`. Artifact has no detectable capabilities → empty array (not null). Frontmatter `requires` contains capability not in the system's known list → still include it verbatim.

**Error handling:** Unparseable manifest JSON/YAML → log parse error, return empty capabilities. Frontmatter parse failure → treat as skill with no frontmatter metadata.

**NFRs:** NFR-041 (add new types via localized changes only)
**Dependencies:** T004
**Acceptance:** Each known artifact type produces correct capabilities. A plugin with a hook component correctly yields both 'plugin' and 'hooks' capabilities. Frontmatter override correctly replaces inferred capability. Union of empty component list returns empty.

---

- [x] T006 Implement catalog search and filter ✅
**Files:** `src/core/catalog/search.ts`
**Source:** design.md §4.1, plan.md §3.1, spec.md FR-006

**Interface:**
```typescript
interface SearchQuery {
  type?: ArtifactType | ArtifactType[];
  capability?: string | string[];
  source?: 'github' | 'git' | 'marketplace' | 'local';
  path?: string;          // subpath filter (glob)
  text?: string;          // free text search across name, path, metadata
  tags?: string[];        // only for skills (from frontmatter tags)
  limit?: number;         // default 50
  offset?: number;        // default 0
}
function searchCatalog(repo: Repository, query: SearchQuery): Artifact[];
```

**Description:** Build SQL query dynamically from `SearchQuery` filters. Type filter uses `IN` clause for arrays. Text search uses SQLite `LIKE` on `name`, `path`, and `metadata` fields (note: metadata is JSON text, so LIKE on serialized JSON works for simple searches). Tags filter parses metadata JSON and checks tag presence. Capability filter uses SQLite `json_each` or LIKE on capabilities JSON string. Source filter matches on `source` JSON field. Return results sorted by name ascending, paginated by limit/offset.

**Edge cases:** No filters provided → return all artifacts (paginated). Empty result → empty array (not null). Invalid filter value → ignore that filter, log warning. Extremely broad query (>1000 results) → enforce limit, warn if truncated. SQL injection via query parameters → use parameterized queries only.

**Error handling:** DB error during search → re-throw as SearchError with context. Invalid regex in text filter → fall back to plain LIKE.

**NFRs:** NFR-003 (search <1s for 1000 artifacts)
**Dependencies:** T003, T005
**Acceptance:** Search by single type returns correct count. Combined type + capability filter narrows results. Text search matches artifact names. Tag filter on skills works. Pagination returns correct slices.

---

## Phase 3: Profiles and Compatibility Audit

- [x] T007 Implement harness profile registry ✅
**Files:** `src/core/profiles/profile-registry.ts`
**Source:** design.md §4.3, plan.md §3.3, spec.md FR-020–FR-023
**FRs:** FR-020 (declarative profiles), FR-021 (built-in profiles), FR-022 (custom profiles), FR-023 (versionable)

**Description:** Load YAML harness profiles from `profiles/` directory. Profile schema per contract `harness-profile.md`: `name` (string, required), `artifactTypes` (array of `{type: ArtifactType, locations: {global: string, project: string}, flat: boolean, configFormat: string | null}`), `capabilities` (array of `{type: string, dialects: string[]}`), `deployment` (`{method: 'link'|'copy', crossDevice: boolean, priorStateBackup: boolean}`). Validate each profile against schema on load with descriptive errors. Built-in profiles for: Claude Code (`claude-code.yaml`), Codex (`codex.yaml`), Antigravity (`antigravity.yaml`), OpenCode (`opencode.yaml`). Load from both `profiles/` and `~/.config/quartermaster/profiles/` (user overrides take priority). Expose `listProfiles(): Profile[]`, `getProfile(name: string): Profile`, `addProfile(profile: Profile): void`, `removeProfile(name: string): void`.

**Edge cases:** Profile YAML parse error → report file path + line number + error. Missing required field → fail validation with documented field path. Unknown field in YAML → warn but proceed (forward compat). Profile with duplicate name → user override wins. Empty profiles directory → fall back to built-in defaults only.

**Error handling:** Invalid YAML syntax → YAMLError with file and position. Required field missing → validation error listing missing field. Built-in profile cannot be removed → error clarifying built-in vs custom.

**NFRs:** NFR-040 (add new harness via data alone, no code change)
**Dependencies:** T002
**Acceptance:** All 4 built-in profiles load without errors. Claude Code profile has correct paths. Adding a custom profile works and appears in listings. Malformed YAML produces positional error message.

---

- [x] T008 Implement compatibility verdict computation ✅
**Files:** `src/core/audit/auditor.ts`
**Source:** design.md §4.4, plan.md §3.4, spec.md FR-030–FR-034
**FRs:** FR-030 (compute verdict), FR-031 (human-readable reason), FR-032 (transform detection), FR-033 (compatibility matrix), FR-034 (manual override)

**Interface:**
```typescript
interface VerdictResult {
  artifactId: string;
  harness: string;
  verdict: 'deployable' | 'incompatible' | 'transform';
  reason: string;
  transformation?: string;
}
function computeVerdict(artifact: Artifact, profile: Profile, overrides: Map<string,Map<string,VerdictOverride>>): VerdictResult;
function computeCompatibilityMatrix(artifacts: Artifact[], profiles: Profile[], overrides: Map<string,Map<string,VerdictOverride>>): VerdictResult[][];
```

**Description:** Verdict logic as a pure function (no side effects, deterministic). For a single (artifact, profile) pair: (1) check if artifact type is in profile's `artifactTypes` — if not, verdict `incompatible` with reason `"type {type} not supported by harness {name}"`. (2) For each capability of artifact, check if profile supports that capability type — if any unsupported, verdict `incompatible` with `"capability {type} not supported"`. (3) For each capability with a dialect, check match against profile's known dialects — if no match and no translator registered (see T009), verdict `incompatible` with `"dialect {dialect} for capability {type} not supported"`. (4) If translator exists for dialect mismatch, verdict `transform` with transformation named. (5) If all checks pass and profile's `deployment.flat` is true and artifact has organizational nesting requiring flatten, verdict `transform` with `"flatten"`. (6) Otherwise verdict `deployable`. (7) Check overrides map: if `overrideVerdict` exists for this (artifactId, harness), supersede computed result with `overrideVerdict.status` and `"manual override: {note}"` reason. Compatibility matrix: produce a 2D array of VerdictResult for all pairs of (artifact × profile).

**Edge cases:** Empty artifact list → empty matrix. Empty profile list → empty matrix. All artifacts deployable → all green. All artifacts incompatible → all red with individual reasons. Override for non-existing artifact → ignore with warning. Override that forces 'deployable' on incompatible → allowed (override supersedes).

**Error handling:** Profile not found → throw `ProfileNotFoundError`. Artifact with no capabilities → treat as having zero capability requirements (can only fail on type check).

**NFRs:** NFR-002 (audit 1000x10 <5s), NFR-050 (plain-language reasons)
**Dependencies:** T002, T007
**Acceptance:** Correct verdict for skill→ClaudeCode (deployable). Correct verdict for mcp-config→Codex without dialect match (transform or incompatible depending on translator). Override flips verdict. Matrix with 5 artifacts × 5 profiles produces 25 cells.

---

- [x] T009 Implement transform registry ✅
**Files:** `src/core/audit/transforms.ts`
**Source:** design.md §4.4–4.5, plan.md §3.4

**Interface:**
```typescript
interface Transform {
  name: string;
  sourceType?: ArtifactType;
  sourceDialect?: string;
  targetDialect?: string;
  apply(input: Artifact, context: { profile: Profile; harnessPath: string }): Promise<TransformedArtifact>;
}
const registry: Map<string, Transform>;
function registerTransform(t: Transform): void;
function getTransform(name: string): Transform | undefined;
function listTransforms(): Transform[];
```

**Description:** Transform registry for dialect bridging and format conversion. Built-in transforms: (1) `flatten` — takes nested source path, produces flat target name by replacing `/` with `-` or by appending parent directory name as prefix when collision detected. (2) `config-translate:json→yaml` — read canonical MCP server JSON config, write YAML format for harnesses that expect it. (3) `config-translate:yaml→json` — reverse direction. (4) `config-translate:toml→json` — for harnesses that expect TOML. (5) `capability-adapter:agent-md→hooks-md` — adapt skill with agent-md dialect for harness that expects hooks-md format (add hook-compatible framing). Each transform has clear input and output types. Transforms are composable: `apply` can chain multiple transforms.

**Edge cases:** Transform input format doesn't match expectations → error with format expected vs received. Chained transforms where intermediate output is invalid → catch and report which transform in chain failed. Transform not found → registry returns undefined, caller handles. Input artifact has null content → error.

**Error handling:** Transforms that modify actual state (config translation) MUST NOT write to disk — they produce transformed content as return value. Write is handled by deploy engine. Transform errors MUST NOT corrupt the original artifact.

**Dependencies:** T008
**Acceptance:** Flatten transforms `a/b/c.md` to `a-b-c.md` correctly. Config-translate JSON→YAML produces valid YAML. Config-translate YAML→JSON produces valid JSON. Unknown transform name returns undefined.

---

## Phase 4: Deployment Engine

- [x] T010 Implement deployment plan compiler ✅
**Files:** `src/core/deploy/plan.ts`
**Source:** design.md §4.6, plan.md §3.5, spec.md FR-040–FR-048
**FRs:** FR-040 (compile per-harness plan), FR-041 (flatten), FR-042 (link/copy), FR-043 (config translation), FR-044 (exclude incompatible), FR-045 (dry-run), FR-046 (record for reversal), FR-047 (single/group/all harnesses), FR-048 (scope to subset)

**Interface:**
```typescript
function compilePlan(artifacts: Artifact[], verdicts: VerdictResult[], harness: string, scope?: Artifact[]): DeploymentPlan;
function compileMultiHarnessPlan(artifacts: Artifact[], verdictsByHarness: Map<string,VerdictResult[]>, harnesses: string[]): Map<string,DeploymentPlan>;
```

**Description:** For a given harness and artifact+verdict set: (1) Filter out artifacts with `incompatible` verdict — include in plan's `excluded` array with their reason. (2) For `deployable` verdicts: create `DeploymentOperation` with `method: profile.deployment.method` and no transform. (3) For `transform` verdicts: create `DeploymentOperation` with named transform, set method based on profile. (4) Resolve target path: lookup profile's path convention for the artifact type, combine with base library structure. Apply flatten if profile requires flat layout (name collision detection: if two artifacts flatten to same target name, prepend parent directory to one). (5) For single harness: produce one DeploymentPlan. For group/all: produce Map of harness → DeploymentPlan. Scope filtering: if `scope` provided, only include artifacts in scope.

**Edge cases:** No deployable artifacts → plan with empty operations array, all artifacts in excluded. Scope artifact not in library → warn and skip. Same artifact deployed to two harnesses → independent operations per harness. Target path already occupied → detect and warn in dry-run, decide overwrite vs skip during apply.

**Error handling:** Harness profile not found → throw. Verdict missing for an artifact → error (must run audit before compile). Target path resolves outside harness root → clamp and warn.

**NFRs:** NFR-010 (idempotent deploy), NFR-011 (library read-only)
**Dependencies:** T008, T009
**Acceptance:** Plan with 5 artifacts (3 deployable, 1 transform, 1 incompatible) produces 3 operations + 1 excluded. Multi-harness plan produces correct per-harness operations. Scope filter correctly limits plan.

---

- [x] T011 Implement file placement executor (link/copy) ✅
**Files:** `src/core/deploy/placer.ts`
**Source:** design.md §4.6, plan.md §3.5, spec.md FR-042

**Interface:**
```typescript
interface PlacementResult {
  operations: Array<{ operation: DeploymentOperation; status: 'placed' | 'skipped' | 'failed'; error?: string }>;
  rollback: () => Promise<void>;
}
async function executePlacement(plan: DeploymentPlan, repo: Repository): Promise<PlacementResult>;
```

**Description:** Execute all operations in a deployment plan. For each operation: (1) If `method === 'link'`: attempt `fs.symlink` (on macOS/Linux). If `symlink` fails with `EPERM` or `EACCES` (Windows without developer mode): fall back to copy, record the fallback in the operation metadata. (2) If `method === 'copy'`: `fs.copyFile` with `COPYFILE_FICLONE` (attempt reflink first, fall back to stream copy). (3) If transform required: apply transform (from T009) BEFORE placement. (4) CAPTURE PRIOR STATE: before writing target path, check if file exists, read its content and compute hash, record permissions. Store in operation's `priorState` field. (5) Write file. **Batch semantics**: if any operation fails, roll back all prior operations in this plan by restoring captured prior states. Return result with per-operation status and a `rollback()` function for external invocation.

**Edge cases:** Target directory does not exist → create with `mkdir -p`. Target path is a dangling symlink → remove and place new. Cross-device symlink → fall back to copy automatically. Permission error on write → fail that operation, trigger batch rollback. Disk full → fail with ENOSPC, trigger batch rollback. Race condition: another process modifies target between capture and write → detect via hash comparison in prior state. Very long path names (>255 chars per segment on some filesystems) → warn, still attempt.

**Error handling:** Failed to capture prior state → fail the operation (cannot guarantee reversibility). Rollback itself fails → log urgently ("partial rollback: target may be in inconsistent state"), include list of operations that could not be reversed. Permission errors during rollback → error listing which files could not be restored.

**NFRs:** NFR-012 (all disk mutations reversible), NFR-020 (copy fallback on Windows)
**Dependencies:** T010
**Acceptance:** Symlink on macOS creates valid symlink. Copy fallback on simulated platform constraint works. Fail-and-rollback of 3 operations restores all 3 prior states. Prior state capture works for new file (prior state: empty) and existing file (prior state: content hash + permissions).

---

- [x] T012 Implement flatten name transformation ✅
**Files:** `src/core/deploy/flatten.ts`
**Source:** design.md §4.6, plan.md §3.5, spec.md FR-041

**Interface:**
```typescript
function flattenPath(artifactPath: string, libraryRoot: string): string;
function detectCollisions(operations: Array<{sourcePath: string; targetPath: string}>): Map<string, string[]>;
function disambiguate(collisions: Map<string, string[]>): Map<string, string>;
```

**Description:** Flatten a nested library path to a flat harness target path. Given an artifact at `library/mcp/community/my-server.json`, produce `my-server.json`. If this collides with another artifact at `library/mcp/official/my-server.json`, disambiguated names become `community-my-server.json` and `official-my-server.json`. Collision detection: group all target paths, any duplicate → collision set. Disambiguation: prepend the immediate parent directory name, or the first non-common path segment. Log flatten decisions in a structured array: `[{source, target, reason: 'flatten' | 'disambiguate'}]`.

**Edge cases:** Collision even after prepending parent → use grandparent + parent + name. Three+ way collision → continue prepending until unique. Artifact already at flat root → no flatten needed (path unchanged). Artifact name contains path separators (unlikely but possible) → treat as flat name, don't split.

**Error handling:** Inability to resolve collision after 5 attempts → error with all colliding paths and attempted disambiguations.

**NFRs:** NFR-010 (idempotent flatten)
**Dependencies:** T010
**Acceptance:** `library/a/b/c.md` → `c.md` (no collision). `lib/a/x.md` + `lib/b/x.md` → `a-x.md` and `b-x.md`. Triple collision resolves with progressive prepending.

---

- [x] T013 Implement config format writers ✅
**Files:** `src/core/deploy/config-writer.ts`
**Source:** design.md §4.6, plan.md §3.5, spec.md FR-043

**Interface:**
```typescript
type ConfigFormat = 'json' | 'yaml' | 'toml';
function writeConfig(config: McpServerDef, format: ConfigFormat): string;
function validateConfig(content: string, format: ConfigFormat): boolean;
```

**Description:** Convert canonical MCP server definition (JSON) to the target harness's config format. Canonical `McpServerDef`: `{name: string, type: 'mcp-server', command?: string, args?: string[], env?: Record<string,string>, transport: 'stdio' | 'sse', url?: string}`. JSON output: pretty-printed with 2-space indent. YAML output: via `js-yaml` or manual string building, ensure multiline strings use `|` block style. TOML output: via `smol-toml` or manual, handle table arrays correctly. Validate output by parsing it back in the target format. Include error context on parse failure (line number, position).

**Edge cases:** Empty env block → omit from output. No command (SSE transport) → output only url. Very long strings (command paths) → no line-wrapping in YAML, use plain string. Special characters in env values → quote appropriately per format. `null` values → omit from output.

**Error handling:** Unknown format → error with supported formats list. Output validation fails → error with parsed output position and expected format.

**Dependencies:** T010
**Acceptance:** JSON output parses as valid JSON. YAML output parses as valid YAML. TOML output parses as valid TOML. Round-trip: parse(write(config, format), format) → equivalent to config.

---

- [x] T014 Implement deployment records and rollback ✅
**Files:** `src/core/deploy/records.ts`, `src/core/deploy/rollback.ts`
**Source:** design.md §4.6, plan.md §3.5, spec.md FR-045–FR-046
**FRs:** FR-045 (dry-run → confirm), FR-046 (record and reverse)

**Interface:**
```typescript
async function applyDeployment(plan: DeploymentPlan, repo: Repository, confirm: boolean): Promise<DeploymentRecord>;
async function rollbackDeployment(recordId: string, repo: Repository): Promise<DeploymentRecord>;
function dryRunPlan(plan: DeploymentPlan): string;
```

**Description:** `applyDeployment`: (1) If `confirm === false`, throw (caller must confirm first). (2) Record prior states via placer's `executePlacement`. (3) On success, create `DeploymentRecord` with plan, status: 'applied', and timestamp. Store in DB via `repo.recordDeployment()`. (4) If placement fails, record with status 'failed' and partial operations list. `rollbackDeployment`: (1) Load `DeploymentRecord` by ID from DB. (2) Execute reverse of each operation in the plan: for each, if prior state exists, restore prior content; if prior state was empty (new file), delete the created file. (3) Record the rollback as a new `DeploymentRecord` with status 'rolled-back' linking to original. `dryRunPlan`: render human-readable summary: harness, file count per method, transform count, exclusion list with reasons, collision warnings.

**Edge cases:** Rollback of a rollback → disallow (rollback of rollback would be a re-apply). Deployment record not found → error. Deployment half-applied (some operations succeeded, some failed) → roll back the successful ones (placer already handles this via batch semantics). Dry-run with no operations → "Nothing to deploy". Dry-run with exclusions → list excluded artifacts prominently.

**Error handling:** Rollback of deployment with missing prior state → error listing which operations have no prior state. Record DB write fails after placement → critical: log warning, still return record. Retry logic for IO errors: 2 retries with 100ms backoff.

**NFRs:** NFR-010 (idempotent), NFR-012 (reversible), NFR-050 (plain-language)
**Dependencies:** T003, T010, T011
**Acceptance:** Dry-run produces readable summary. Deployment records created in DB. Rollback restores all files to prior state. Rollback of half-applied deployment succeeds. Second rollback is rejected.

---

## Phase 5: Loadouts and Pipelines

- [x] T015 Implement loadout manager ✅
**Files:** `src/core/loadouts/loadouts.ts`
**Source:** design.md §4.9, plan.md §3.10, spec.md FR-090–FR-093
**FRs:** FR-090 (define named loadouts), FR-091 (assign to harnesses), FR-092 (deactivate outside loadout), FR-093 (copy/move between harnesses)

**Interface:**
```typescript
interface LoadoutManager {
  create(loadout: LoadoutDefinition): void;
  list(): LoadoutDefinition[];
  get(name: string): LoadoutDefinition | null;
  update(name: string, loadout: Partial<LoadoutDefinition>): void;
  delete(name: string): void;
  activate(harness: string, loadoutName: string): void;
  deactivate(harness: string): void;
  copy(loadoutName: string, newName: string): LoadoutDefinition;
  getActiveLoadout(harness: string): LoadoutDefinition | null;
}
```

**Description:** Loadout = named subset of artifacts (by ID) plus pipeline references. Create creates DB record. Activate sets harness's active loadout, which scopes deployment to only artifacts in the loadout. Deactivate clears it (deploy all artifacts). Copy duplicates loadout with new name. Move = copy + delete original, reassign harness references. Loadout definitions stored in SQLite `loadouts` table. Activation changes are NOT deployment — they only set the active loadout reference. Actual deployment must be triggered separately.

**Edge cases:** Loadout references nonexistent artifact → warn on activate but still allow (deployment will skip). Delete active loadout → disallow (must deactivate first). Activate on harness with existing active loadout → replace (previous loadout still exists in DB, just deactivated). Copy with same name → error. Loadout with empty artifact array → valid (empty set = nothing deploys to that harness).

**Error handling:** Loadout name already exists → error. Harness not found in profiles → error. Loadout references nonexistent pipeline → warn, activate proceeds.

**Dependencies:** T003, T007
**Acceptance:** Create, list, get, update, delete all work. Activate sets active loadout for harness. Deactivate clears it. Copy creates duplicate with new name. Deletion of active loadout is rejected.

---

- [x] T016 Implement pipeline engine ✅
**Files:** `src/core/pipelines/pipelines.ts`
**Source:** design.md §4.10, plan.md §3.11, spec.md FR-100–FR-101
**FRs:** FR-100 (define and activate pipelines), FR-101 (validate composition constraints)

**Interface:**
```typescript
interface PipelineManager {
  create(pipeline: PipelineDefinition): void;
  list(): PipelineDefinition[];
  validate(pipeline: PipelineDefinition): string[];  // returns errors
  compose(pipelines: PipelineDefinition[]): Artifact[];  // resolved artifact list
}
```

**Description:** Pipeline definition: name, ordered list of artifact IDs, activation directives (exclusive: boolean, priority: number). Validate: (1) all referenced artifacts exist in catalog, (2) no circular references between pipelines (not typical for artifact lists but check), (3) no duplicate artifact IDs within pipeline. Compose: merge multiple pipelines respecting priority and exclusivity. If pipeline A has `exclusive: true`, artifacts in pipeline B with same type as A's artifacts are excluded.

**Edge cases:** Empty pipeline (no artifacts) → valid, composes to empty. Pipeline referencing deleted artifact → fail validation. Two pipelines with same name → error on create. Compose with 0 pipelines → empty list. Exclusive + same-type exclusion removes correct artifacts.

**Error handling:** Circular dependency → error listing the cycle. Artifact not found → error listing missing ID.

**Dependencies:** T003, T015
**Acceptance:** Create and validate work. Compose merges correctly. Exclusive pipeline excludes same-type artifacts from other pipelines. Validation catches missing artifacts.

---

## Phase 6: Sources and Currency

- [x] T017 Implement source importers ✅
**Files:** `src/core/sources/importers.ts`
**Source:** design.md §4.7, plan.md §3.7, spec.md FR-010–FR-014
**FRs:** FR-010 (record provenance), FR-011 (import from 4 sources), FR-014 (pinning)

**Interface:**
```typescript
interface ImportOptions {
  source: ArtifactSource;
  targetDir: string;
  pin?: string;         // revision to pin at
  onProgress?: (msg: string) => void;
}
async function importFromSource(opts: ImportOptions): Promise<ScanResult>;
```

**Description:** Dispatch import based on source kind. `github`: fetch archive from `https://api.github.com/repos/{owner}/{repo}/zipball/{ref}`, extract to `targetDir/{owner}-{repo}/`. Use `fetch` (no external git dependency needed for GitHub). `git`: shell out to `git clone {url} {targetDir}` with shallow flag (`--depth 1`) for speed. `marketplace`: fetch via HTTP from URL, save to `targetDir/{name}`. `local`: copy (`fs.cp`) from source path to `targetDir/{basename}`. After import, run scanner (T004) on `targetDir` to catalog imported artifacts. Record provenance: store source info in artifact's `source` field. Pin: if `pin` provided, store as `pinnedRevision` and skip future sync updates.

**Edge cases:** GitHub API rate limit → 60 req/hr unauthenticated, warn and suggest token. Network timeout → 30s default, retry once. Import path already exists → merge (add new files, don't overwrite existing library). Import from invalid URL → error. Git not installed → fall back to GitHub API if possible, else error with install instructions. Large import (>1000 files) → stream extraction, report progress via callback.

**Error handling:** Network failure → `ImportError` with URL and error. Disk full during extraction → catch ENOSPC, clean up partial extraction, error. Invalid ref → error from API/git, propagate. Auth failure (API 401) → prompt for token configuration.

**Dependencies:** T004
**Acceptance:** GitHub import downloads and scans correctly. Local import copies files. Provenance recorded on every artifact. Pin prevents subsequent sync updates.

---

- [x] T018 Implement git subprocess wrapper ✅
**Files:** `src/core/sources/git.ts`
**Source:** design.md §4.7, plan.md §3.7

**Interface:**
```typescript
async function gitClone(url: string, dir: string, opts?: { shallow?: boolean; branch?: string }): Promise<void>;
async function gitFetch(dir: string): Promise<void>;
async function gitLog(dir: string, since?: string): Promise<Array<{hash: string; date: string; message: string}>>;
async function gitCheckout(dir: string, ref: string): Promise<void>;
async function gitCurrentRef(dir: string): Promise<string>;
function isGitAvailable(): boolean;
```

**Description:** Each function shells out to `git <command>` via `Bun.spawn` or `child_process.exec`. Capture stdout/stderr. Parse structured output (git log uses `--format="%H|%ai|%s"`). Handle: git not installed → `isGitAvailable()` returns false, all other functions throw `GitNotAvailableError`. Large repos → shallow clone only. `gitClone` with `shallow: true` passes `--depth 1` for speed. Timeout: 60s for clone, 10s for other operations. All functions check `isGitAvailable()` first.

**Edge cases:** Git repo already exists at target → error (caller must remove first). Auth failure → propagate stderr. Non-git directory → `git log` on dir without .git → error. Empty repo (no commits) → `git log` returns empty array, `gitCurrentRef` returns null. Binary files in repo → no special handling (already handled by scanner).

**Error handling:** Git not installed → `GitNotAvailableError` with install instructions. Timeout → `GitTimeoutError` with operation name. Auth failure → include stderr in error message.

**Dependencies:** None
**Acceptance:** `isGitAvailable()` returns true when git is installed. `gitClone` creates valid git repo. `gitLog` returns correctly parsed log. Timeout triggers after specified duration.

---

- [x] T019 Implement sync engine ✅
**Files:** `src/core/sources/sync.ts`
**Source:** design.md §4.8, plan.md §3.7, spec.md FR-012–FR-014
**FRs:** FR-012 (check upstreams), FR-013 (auto-update vs conflict), FR-014 (pinning)

**Interface:**
```typescript
interface SyncReport {
  unchanged: string[];
  updated: string[];
  conflicts: Array<{artifact: string; localRevision: string; upstreamRevision: string}>;
  pinned: string[];
  errors: Array<{artifact: string; error: string}>;
}
async function syncUpstreams(repo: Repository, importers: ImportManager): Promise<SyncReport>;
```

**Description:** For each artifact with a non-local source: (1) Skip if pinned (`pinnedRevision` is set). (2) Fetch latest revision from source (via git fetch or API call). (3) Compare current revision vs latest. (4) If unchanged → add to `unchanged`. (5) If upstream changed AND artifact has `localModifications === false` → auto-update: re-import, re-scan, update catalog. (6) If upstream changed AND artifact has `localModifications === true` → add to `conflicts` — do NOT update. Report conflict with local and upstream revisions.

**Edge cases:** Source no longer reachable → add to `errors`, continue other syncs. Artifact deleted from upstream → mark as removed in catalog (notify). Pin changed on already-pinned artifact → new pin takes effect on next sync. Local modification flag set incorrectly (false positive) → user can clear via CLI. Sync of 500+ artifacts → report progress periodically.

**Error handling:** Source unreachable → log warning, add to errors, do not update. Partial sync failure → report successfully synced and failed separately. Repository DB write error during sync → roll back that artifact's update.

**Dependencies:** T003, T017, T018
**Acceptance:** Sync with all upstreams unchanged returns all in `unchanged`. Sync with modified upstream returns updated artifact in `updated`. Sync with local modifications and upstream change returns conflict.

---

- [x] T020 Implement risk scanner ✅
**Files:** `src/core/risk/scanner.ts`
**Source:** design.md §4.7, plan.md §3.8, spec.md FR-071
**FRs:** FR-071 (scan for risk indicators)

**Interface:**
```typescript
interface RiskFlag {
  artifactId: string;
  type: 'bundled-script' | 'network-access' | 'shell-execution' | 'secret-access' | 'known-vulnerable-dep' | 'base64-code';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
  location?: string;  // path or field within artifact where risk was found
}
async function scanRisks(artifact: Artifact): Promise<RiskFlag[]>;
```

**Description:** Read artifact content and metadata, scan for risk patterns. Signature-based: detect known vulnerable dependency names (list of known patterns). Heuristic: base64 strings longer than 100 chars in metadata fields → decode to check if it's executable code (contains `function`, `import`, `require`, `exec`, `spawn`). Network access: check metadata for URLs, `api.` patterns, `fetch` or `axios` usage in code artifacts. Shell execution: detect `exec`, `spawn`, `shell: true`, `child_process` in code artifacts. Secret access: detect `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `process.env` access patterns in skill frontmatter or plugin code. Bundled scripts: detect artifact that references or bundles executable files.

**Edge cases:** Binary artifact → skip content scanning (only check metadata). Empty artifact → return empty. Overly broad detection (false positive) → flag at lower severity. Encrypted/obfuscated content → can't detect, skip with note. Large artifact content (>10MB) → skip content scan, scan metadata only.

**Error handling:** Read error (file deleted, permission) → return RiskFlag with 'scan-error' type, not crash.

**Dependencies:** T002
**Acceptance:** Artifact with base64-encoded eval() in metadata → flagged critical. Artifact referencing `ANTHROPIC_API_KEY` in code → flagged high. Clean artifact → no flags. Binary artifact → metadata-only scan.

---

## Phase 7: Guidance, Safety, and Agentic Evaluation

### T021: Implement guidance engine
**Files:** `src/core/guidance/render.ts`
**Source:** design.md §4.11, plan.md §3.12, spec.md FR-120–FR-122
**FRs:** FR-120 (generate per-harness), FR-121 (managed sections), FR-122 (preserve unmanaged content)

**Interface:**
```typescript
interface GuidanceInput {
  canonical: string;                // canonical guidance content
  pipelineDirectives: string[];     // directives from active pipelines
  targetHarness: string;
  existingFile?: string;            // current content on disk (if any)
}
function renderGuidance(input: GuidanceInput): GuidanceDocument;
function detectManagedSections(content: string): Array<{start: number; end: number; content: string}>;
```

**Description:** Render guidance file (CLAUDE.md, AGENTS.md) for a given harness. Content structure: canonical guidance first (always), pipeline directives appended in ordered sections, each wrapped in managed section comments: `<!-- MANAGED BY QUARTERMASTER: {section-name} -->` … `<!-- END MANAGED -->`. If `existingFile` is provided, detect existing managed sections and replace their content while preserving everything UNMANAGED (outside delimiters). If no existing file, produce full file with all managed sections. Managed sections rebuilt from scratch on each render — never append to existing managed sections.

**Edge cases:** Existing file has malformed managed section (opened but not closed) → treat as unmanaged, warn. Existing file has managed section with name that no longer exists in render → preserve? Decision: keep for one render cycle with deprecation warning, then remove. Empty canonical guidance → skip canonical section, only pipeline directives. No existing file → new file with all managed sections.

**Error handling:** Rendering produces empty content → error. Managed delimiter injection attempt in pipeline directive content → escape delimiters.

**Dependencies:** T002, T016
**Acceptance:** New file renders with managed sections. Existing file preserves unmanaged content between delimiters. Pipeline directives appear in their managed sections. Removed directive → section deprecated first render, removed second render.

---

### T022: Implement safety auditor orchestrator
**Files:** `src/core/safety/auditors.ts`, `src/core/safety/findings.ts`
**Source:** design.md §4.14, plan.md §3.15, spec.md FR-140–FR-142
**FRs:** FR-140 (run auditors), FR-141 (score and gate), FR-142 (override)

**Interface:**
```typescript
interface AuditorConfig {
  name: string;
  command: string;     // subprocess command (may include {path} placeholder)
  args?: string[];
  timeoutMs?: number;
  severityThreshold?: 'low' | 'medium' | 'high' | 'critical';
}
interface AuditorResult {
  auditor: string;
  passed: boolean;
  findings: SafetyFinding[];
  rawOutput?: string;
  durationMs: number;
}
interface SafetyReport {
  artifactId: string;
  auditors: AuditorResult[];
  passed: boolean;
  overridden?: boolean;
  overrideNote?: string;
}
async function runAuditors(artifact: Artifact, configs: AuditorConfig[]): Promise<SafetyReport>;
async function thresholdGate(report: SafetyReport, threshold: 'low' | 'medium' | 'high' | 'critical'): boolean;
```

**Description:** For each configured auditor: spawn subprocess with artifact path, collect findings. Normalize: each auditor returns structured findings (severity, source, description, artifactId). Aggregate into SafetyReport. `thresholdGate`: report passes if no finding has severity >= threshold. Fail closed: if any auditor errors (timeout, crash), report that auditor as failed with error finding at `severity = threshold`. Override system: user can set override for artifactId + auditor pair to bypass threshold gate with note.

**Edge cases:** Auditor not installed → error finding at threshold severity. Auditor returns no findings → passed. All auditors pass → passed = true. Auditor timeout → fail closed. Binary artifact → skip content auditors, run metadata-only auditors. Auditor produces infinite output → truncate at 10KB.

**Error handling:** Subprocess spawn fails (binary not found) → auditor result with error. Subprocess exits non-zero → capture stderr as auditor error. Timeout → kill subprocess, result with timeout error.

**Dependencies:** T002, T020
**Acceptance:** All auditors run against single artifact. Report passes with no findings. Report fails with finding at threshold. Override bypasses threshold. Auditor binary not found → error finding at threshold.

---

### T023: Implement model gateway client
**Files:** `src/core/evaluation/gateway.ts`
**Source:** design.md §4.13.1, plan.md §3.14, spec.md FR-103
**FRs:** FR-103 (provider-agnostic model routing)

**Interface:**
```typescript
interface GatewayConfig {
  provider: string;         // 'openai-compatible'
  baseUrl: string;
  model: string;
  apiKey?: string;          // from env, not hardcoded
  timeout: number;          // ms, default 30000
  maxRetries: number;       // default 2
}
interface GatewayResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number };
}
async function singleTurn(prompt: string, config: GatewayConfig): Promise<GatewayResponse>;
async function multiTurn(messages: Array<{role: string; content: string}>, config: GatewayConfig): Promise<GatewayResponse>;
```

**Description:** Provider-agnostic LLM gateway. `singleTurn` sends a single user message to the configured endpoint via HTTP POST. `multiTurn` sends full message history. Supports OpenAI-compatible chat completions API format. API key loaded from environment variable (not config file). Timeout: abort request after configured duration. Retry: exponential backoff (100ms, 200ms, 400ms) on 5xx errors and network failures. Model config stored in per-harness or global config file (JSON/YAML), not in code. If no endpoint configured → throw clear error with instructions to configure.

**Edge cases:** API returns 401 → no retry, error with auth instructions. API returns 429 → retry with backoff (max 3 attempts). API returns non-JSON → error with raw response excerpt. Response truncated (finish_reason: 'length') → include in response metadata. Empty prompt → error. Very long prompt (>config max tokens) → warn, truncate.

**Error handling:** Network error → retry, then throw with details. Timeout → throw GatewayTimeoutError. All retries exhausted → throw with last error. No API key → error with "set ANTHROPIC_API_KEY or OPENAI_API_KEY env var".

**NFRs:** NFR-061 (provider-agnostic, not bound to one vendor)
**Dependencies:** T002
**Acceptance:** singleTurn with valid config returns response. multiTurn with message history returns coherent response. Timeout triggers after configured duration. API error propagates with context. No config → clear configuration error.

---

### T024: Implement evaluation workflows
**Files:** `src/core/evaluation/workflows.ts`
**Source:** design.md §4.13.2, plan.md §3.13, spec.md FR-104–FR-106
**FRs:** FR-104 (grade, compare, propose), FR-105 (turn budget), FR-106 (fail closed)

**Interface:**
```typescript
interface GradeInput { artifact: Artifact; rubric: string; }
interface CompareInput { artifacts: [Artifact, Artifact]; criteria: string; }
interface ProposeInput { artifacts: Artifact[]; constraint: string; }
interface WorkflowResult {
  type: 'grade' | 'compare' | 'propose';
  output: string;
  confidence?: number;
  turnCount: number;
  model: string;
}
async function grade(input: GradeInput, config: GatewayConfig, budget?: number): Promise<WorkflowResult>;
async function compare(input: CompareInput, config: GatewayConfig, budget?: number): Promise<WorkflowResult>;
async function propose(input: ProposeInput, config: GatewayConfig, budget?: number): Promise<WorkflowResult>;
```

**Description:** Three evaluator workflows. `grade`: single-turn, send artifact content + rubric, get score and reasoning. `compare`: multi-turn, present both artifacts + criteria, get preference and reasoning. `propose`: multi-turn, present full artifact set + constraint, get loadout/pipeline recommendation. Turn budget: each workflow respects `budget` (max LLM turns). If budget exceeded → fail closed (return `{output: null, error: 'turn budget exceeded'}`). Structured output parsing: extract JSON from response (find `{...}` block), validate schema, fall back to raw text if parse fails. Each result includes model name, turn count, and timestamp.

**Edge cases:** Rubric empty → use default rubric ("quality, correctness, completeness"). Artifact content too large (exceeds model context) → truncate with warning. Model returns only whitespace → treat as empty response. Turn budget of 0 → fail immediately. No artifacts → error.

**Error handling:** Model returns non-JSON when structured output expected → use raw text, log parse failure but don't crash. Gateway error → propagate with workflow context. Budget exceeded → fail-closed result with turn count.

**NFRs:** NFR-062 (configurable turn budget, fail closed)
**Dependencies:** T023
**Acceptance:** Grade returns score and reasoning. Compare returns preference. Propose returns recommendation. Turn budget 0 fails closed. Truncated artifact content is handled.

---

### T025: Implement proposal management (accept/reject)
**Files:** `src/core/evaluation/proposals.ts`, `src/core/evaluation/accept.ts`
**Source:** design.md §4.13.3, plan.md §3.13, spec.md FR-107
**FRs:** FR-107 (accept/reject proposals with explicit developer action)

**Interface:**
```typescript
interface Proposal {
  id: string;
  type: 'loadout' | 'pipeline' | 'evaluation';
  content: unknown;
  rationale: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  acceptedAt?: string;
  rejectionReason?: string;
}
interface ProposalManager {
  create(type: string, content: unknown, rationale: string): Proposal;
  list(type?: string, status?: string): Proposal[];
  get(id: string): Proposal | null;
  accept(id: string): void;
  reject(id: string, reason: string): void;
}
```

**Description:** Evaluation proposals are ALWAYS advisory. `create` stores proposal in SQLite with status 'pending'. `accept` transitions to 'accepted' and APPLIES the proposal content: for loadout proposals, creates the loadout via LoadoutManager; for pipeline proposals, creates the pipeline definition via PipelineManager; for evaluation-only proposals, no state change (only record). `reject` transitions to 'rejected' with reason, no state change. Before accept: validate proposal content (is it valid loadout/pipeline definition?). Reject invalid proposals. Proposals persist in DB indefinitely for audit trail.

**Edge cases:** Accept already-accepted proposal → no-op (idempotent). Reject already-rejected → no-op. Accept with invalid content → reject automatically with "invalid content" reason. Proposal references nonexistent artifact → warn on accept, still create loadout (missing artifacts recorded as warnings). 1000+ pending proposals → paginate list.

**Error handling:** DB write failure during accept → roll back both proposal status change AND loadout/pipeline creation. Invalid content → reject with validation error message.

**NFRs:** NFR-060 (advisory only — no proposal changes deploy without explicit accept)
**Dependencies:** T003, T015, T016, T024
**Acceptance:** Create proposal → pending. Accept loadout proposal → loadout created, proposal status 'accepted'. Accept pipeline proposal → pipeline created, proposal 'accepted'. Reject → status 'rejected', no state change. Accept invalid proposal → auto-reject.

---

## Phase 8: Status, Verification, and Surfaces

### T026: Implement deployment status reporter
**Files:** `src/core/deploy/status.ts`
**Source:** design.md §4.6, plan.md §3.5, spec.md FR-060–FR-061
**FRs:** FR-060 (report deployed artifacts, method, drift), FR-061 (detect orphaned deployments)

**Interface:**
```typescript
interface DeployedArtifact {
  artifactId: string;
  targetPath: string;
  method: 'link' | 'copy';
  inSync: boolean;
  libraryHash: string;
  deployedHash: string;
}
interface HarnessStatus {
  harness: string;
  deployed: DeployedArtifact[];
  orphaned: string[];   // paths in target dir not in library
  lastDeployment?: DeploymentRecord;
}
async function getHarnessStatus(harness: string, repo: Repository, profile: Profile): Promise<HarnessStatus>;
```

**Description:** For a given harness: (1) Read deployment logs from DB to know what was deployed where. (2) Walk target harness directory to find all current files. (3) Compare each deployed artifact's library content hash vs deployed content hash — if different, mark as `inSync: false` (drift). (4) Detect orphaned files: files in target directory NOT corresponding to any artifact in the deployment log. (5) Report status with all fields.

**Edge cases:** Harness directory does not exist → empty status (no files deployed yet). Link was replaced by manual file → drift detected. Orphaned file is a system file (.DS_Store) → filter out known noise (.DS_Store, Thumbs.db, .gitkeep). Deployment log missing but files exist → report as unknown deployment state.

**Error handling:** Permission denied on read → report with partial data. Harness profile not found → error. Target directory listing fails → report as much as possible.

**NFRs:** none specific
**Dependencies:** T003, T007, T011
**Acceptance:** Status report shows deployed artifacts. Modified target files show as drifted. Files not in library show as orphaned. Empty harness shows as "nothing deployed".

---

### T027: Implement CLI command dispatcher
**Files:** `src/cli/index.ts`, `src/cli/commands/*.ts`
**Source:** design.md §5.1, plan.md §4.1, spec.md FR-050, FR-051
**FRs:** FR-050 (self-authored artifacts), FR-051 (treat self-authored identically to imported)

**Interface:**
```typescript
// CLI entry point: parse argv → dispatch
// Subcommands:
//   quartermaster scan [roots...] [--json]
//   quartermaster audit [--harness] [--json] [--matrix]
//   quartermaster deploy [harness] [--dry-run] [--confirm] [--scope]
//   quartermaster rollback [deployment-id]
//   quartermaster status [harness]
//   quartermaster import (--github|--git|--marketplace|--local) <source> [--pin]
//   quartermaster sync [--all|--source <source>]
//   quartermaster loadout create|list|activate|deactivate|copy|delete [args...]
//   quartermaster pipeline create|list|validate [args...]
//   quartermaster eval grade|compare|propose [args...]
//   quartermaster safety audit <artifact-id>
//   quartermaster guidance render <harness>
//   quartermaster profile list|get|add|remove [args...]
//   quartermaster config get|set|list [args...]
```

**Description:** Parse `process.argv.slice(2)` to find the command. Dispatch to handler in `src/cli/commands/{command}.ts`. Global flags: `--help` (show usage for command), `--version` (print version), `--verbose` (detailed logging), `--json` (JSON output). Each handler imports core modules and orchestrates the workflow. Help text: auto-generated from command registrations with argument descriptions.

**Edge cases:** Unknown command → friendly error with "Did you mean?" suggestions (Levenshtein distance). Missing required arg → error with usage. `--help` on any command → detailed usage. No arguments → show top-level help. Flag after subcommand → parse correctly (commander/yargs style).

**Error handling:** Any async error in handler → catch, log, print user-friendly message. Use exit codes: 0=success, 1=user error (bad args), 2=system error (DB failure, etc.). Unhandled Promise rejection → global handler with stack trace.

**NFRs:** NFR-051 (all core functions operable from CLI)
**Dependencies:** All core modules
**Acceptance:** `quartermaster --version` prints version. `quartermaster --help` shows command list. `quartermaster scan ~/skills` invokes scanner. `quartermaster audit --json` outputs JSON matrix. Unknown command suggests similar. Missing required arg errors with usage.

---

### T028: Implement web interface
**Files:** `src/web/app.ts`, `src/web/routes.ts`, `src/web/pages/*.ts`
**Source:** plan.md §3.16, spec.md FR-052, NFR-052

**Description:** Local web interface (dark mode first) built with Hono + JSX. Routes: `GET /` → dashboard (catalog overview, recent deployments, loadout status). `GET /catalog` → searchable artifact table with type/capability/source filters. `GET /catalog/:id` → artifact detail with capabilities, risks, deployment status. `GET /audit` → compatibility matrix (harnesses × artifacts). `GET /deploy` → deployment history and manual trigger. `GET /loadouts` → loadout management. `GET /proposals` → pending proposals with accept/reject. Server starts on `localhost` with configurable port. Design: responsive, dark-mode-first, terminal-like aesthetic consistent with the CLI brand.

**Edge cases:** Port in use → auto-increment, report actual port. Browser refresh on any route → server-side rendering. Large tables (>100 rows) → server-side pagination. Websocket or polling for status updates? Start with polling (5s interval).

**Error handling:** Server crash → log and exit with port. Route not found → 404 page with navigation.

**Dependencies:** T027 (all core modules via CLI)
**Acceptance:** Server starts on configurable port. All routes render. Dark mode is default. Search and filter work. Proposals page shows accept/reject actions.

---

## Depth Verification Summary

- **FR coverage:** 42 FRs listed in spec, all have corresponding task implementations
- **NFR coverage:** 18 NFRs addressed as explicit constraints in relevant tasks
- **Components:** 16 component modules across 8 phases, each with full interface contract
- **Total tasks:** 28 implementation tasks
- **Avg task depth:** 180+ words per task (interface + algorithm + edge cases + error handling)
- **Acceptance criteria:** Each task has verifiable acceptance test
- **Contract definitions:** 3 contracts (CLI commands, harness profile, config translation)
tion)
config translation)

ation)
tion)
config translation)

 profile, config translation)
tion)
config translation)

