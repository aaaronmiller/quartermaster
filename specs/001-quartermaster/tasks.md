---
date: 2026-06-29 00:00:00 UTC
ver: 3.0.0
author: claude-opus
model: claude-opus-4-8
tags: [quartermaster, tasks, functional-requirements, decomposition, gating, speckit]
---

# Quartermaster — Real Implementation Tasks (v3)

## How this list works

This list **supersedes** the v2 list (`archive/tasks-v2-broken.md`), whose coarse
items were marked complete without verifiable code, wiring, or tests.

Rules of this ledger:

1. **The Functional Requirements are the real features.** Each FR is decomposed
   into the actual build → wire → test → verify steps needed to make it real.
2. **A task is `[x]` only with evidence.** Evidence = the named file exists AND
   the `Verify:` signal passes (a command, an observable behavior, or a test).
   No checkmark without a passing verify.
3. **Order is dependency order, not FR-number order.** Phases run top to bottom;
   within a phase, tasks run in listed order unless marked `[P]` (parallelizable —
   no shared file, no ordering dependency on an earlier unfinished task).
4. **Every FR ends in a usable surface.** Core logic that is not wired into the
   CLI (or another surface) is not done — the v2 failure was un-wired libraries.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done+verified · `[P]` parallelizable
Each task: `T### [FR-xxx | NFR-xxx] <imperative> — File: <path> · Verify: <signal>`

### Current reality baseline (2026-06-29)
- 28 core `.ts` files exist (catalog, audit, deploy, eval, guidance, loadouts,
  pipelines, risk, safety, sources, storage) — **logic present, unverified.**
- `src/cli/index.ts` is a stub: prints help, returns "unknown command." **No
  command is wired.** All FR surfaces are currently unreachable.
- All 16 test files sit in `.archive/tests/` — **not running, gating nothing.**

So: most core tasks are "audit existing → fix gaps → wire to CLI → test," not
"write from scratch." Tasks below are phrased to that reality.

---

## Phase 0 — Foundation, Test Gate, and Reality Audit

Establish a trustworthy baseline before claiming any FR. Nothing downstream is
verifiable until tests run and the type/storage core is confirmed.

- [x] T001 Confirm Bun + TypeScript build runs clean — File: package.json, tsconfig.json · Verify: `bun run build` exits 0 ✅ (builds; bundles only 1 module = CLI stub confirmed)
- [x] T002 Restore test runner: move `.archive/tests/` back to `tests/` and make `bun test` discover them — File: tests/ · Verify: `bun test` runs ✅ (16 files discovered & ran). ⚠ FINDING: restored tests target the OLD module layout (`catalog/sync`, `evaluation/workflows`, `deploy/scope`, `scanLibrary`, `auditArtifacts`, `org_path`) — they are stale vs current src and are repaired inside each FR's test task, not here.
- [x] T003 Add `typecheck` script and make it a gate — File: package.json, tsconfig.src.json · Verify: `bun run typecheck` exits 0 ✅. Gate scoped to `src/` (tsconfig.src.json) which is clean (0 errors); `typecheck:all` runs the full tree (75 errors, all from stale tests per T002) and goes green as tests are repaired.
- [x] T004 [P] Add lint/format config (Biome) — File: biome.json, package.json · Verify ✅: `bun run lint` exits 0 on src/ (warnings non-blocking). Safe auto-fixes applied; build+typecheck still green. Scripts: `lint`, `lint:fix`, `format`.
- [~] T005 Audit `src/core/types.ts` against spec §4 entities — File: src/core/types.ts · AUDIT DONE; types are comprehensive but 3 spec-attribute gaps (additive, fixed in their FR tasks): (a) Artifact has no first-class `organizationalPath` distinct from `path` — **FR-002 risk** (add in T021); (b) HarnessProfile has no `guidanceFilename` — **FR-120 risk** (add in T218); (c) ArtifactSource has no `self` kind and no `trusted` flag — **FR-142 risk** (add in T248). `description`/`version` live in `metadata` (acceptable).
- [x] T006 [NFR-031] Confirm no credential/token field is emitted in any serializable type — File: src/core/types.ts · Verify ✅: only `GatewayConfig.apiKey?` holds a credential (eval input config); no token in DeploymentPlan/Record/HarnessProfile/Artifact. Redaction of GatewayConfig.apiKey is enforced by T015c + T181.
- [~] T007 Audit storage migrations cover all entities + provenance + verdicts + records — File: src/storage/migrations.ts · AUDIT DONE; tables present: artifacts, deployment_logs, loadouts, pipelines, proposals. MISSING: (a) `findings` table — **FR-140 blocker** (add in T240); (b) verdict `overrides` table — **FR-034 blocker** (add in T096); (c) no `sources` table (source denormalized into artifacts — OK unless source-level pin/trusted needs it, revisit at T062/T248). Verdicts themselves are computed (pure fn), not persisted — correct.
- [x] T008 Audit repository CRUD against schema; list missing methods — File: src/storage/repository.ts · ⚠ CORRECTION: my grep-based audit gave a false negative — artifact CRUD (upsert/get/getByPath/list/delete/search) DOES exist; reading the file confirmed it. Genuinely missing were pipeline + proposal CRUD → **now ADDED** (upsert/get/list/delete Pipeline; save/get/list/delete Proposal). Loadout assignment is modeled via `upsertLoadout`+`activateLoadout` (no separate table needed). All persisted entities now have CRUD, verified by T010.
- [x] T009 [NFR-030] Confirm DB path is local-only, no network/telemetry calls anywhere — File: src/storage/repository.ts · Verify ✅: no telemetry/analytics; network confined to `sources/` (import/sync) + eval gateway. NFR-030 holds at code level.
- [x] T010 Write repository round-trip test (insert → query → update → delete) for each entity — File: tests/unit/repository.test.ts · Verify ✅: 6/6 pass (artifact, loadout, deployment, pipeline, proposal, integrity). Caught + fixed a real pre-existing bug: `upsertLoadout` mixed positional `?` and named `$` params → loadout updates were silently broken.
- [x] T011 Establish CLI command-dispatch skeleton (arg parse, subcommand table, exit codes, `--json`) — File: src/cli/index.ts · Verify ✅: `qm --help` lists 20 commands (generated from registry); unknown→exit 2; recognized-but-unbuilt→exit 3 honest "not implemented"; FR tasks attach handlers.
- [x] T012 [NFR-050] Define a shared error/output module: plain-language reasons, never silent drop — File: src/cli/output.ts · Verify ✅: success/failure/parseArgs/emit; failure always carries `reason`; covered by tests/unit/output.test.ts (13 pass).
- [x] T013 Define machine-readable output contract (stable JSON envelope) reused by all commands — File: src/cli/output.ts · Verify ✅: `qm --help/--version/scan --json` all emit parseable `{ok,command,data?,reason?}` envelopes.
- [x] T014 [P] Create test fixture library: nested folders, all 8 artifact types — File: tests/fixtures/library/ · Verify ✅: `tests/fixtures/library/mixed/` has all 8 nested (skill, plugin, agent, hook, script, mcp-config, slash-command, output-style).
- [x] T015 Document the build/test/verify gate in CONTRIBUTING — File: CONTRIBUTING.md · Verify ✅: states "no checkmark without evidence" + local gate commands.

### Configuration foundation (NEW — the config layer ~15 downstream tasks assume but no code provides)
- [x] T015a Define config schema — File: src/core/config/schema.ts · Verify ✅: `QuartermasterConfig` covers roots, dbPath, profileDir, harnesses, harnessGroups, safety{threshold,allowlist}, eval{provider,baseUrl,defaultModel,models,apiKeyEnv,turnBudget}. Compiles; secret held by env-var NAME only.
- [x] T015b Implement config loader with precedence defaults < global < project < env — File: src/core/config/load.ts · Verify ✅: injectable `loadConfig`; deep-merge; precedence test passes (env beats project beats global beats defaults).
- [x] T015c [NFR-031] Secret handling: read from env at use time, redacted from serialization — File: src/core/config/secrets.ts · Verify ✅: `resolveApiKey` reads named env var; `redactSecrets` masks credential-named fields at any depth; config file never holds the key.
- [x] T015d Config validation with plain-language errors — File: src/core/config/load.ts, schema.ts · Verify ✅: `validateConfig` returns plain problems; `loadConfig` throws `ConfigError` with actionable summary (e.g. "safety.threshold must be a number between 0 and 1").
- [x] T015e Wire `qm config get/set/list/path` — File: src/cli/commands/config.ts · Verify ✅: end-to-end set→get round-trip; list redacted; path prints files; **invalid set rolls back the file** (no corrupt persisted state).
- [x] T015f Test: precedence + secret redaction + validation — File: tests/unit/config.test.ts · Verify ✅: 11 tests green.
- [~] T015g Refactor downstream consumers to read this layer — File: src/core/config/load.ts · Layer is READY and exported. Consumers (scan roots, sync upstreams, profile dir, eval endpoint, safety threshold) wire to it inside their FR tasks (T019/T056/T075/T182/T244). Stays `[~]` until those are done.

---

## Phase 1 — Catalog & Ingestion (FR-001 … FR-006)
Depends on: Phase 0. The catalog is the spine everything else reads.

### FR-001 — Scan roots, identify all 8 artifact types
- [x] T016 [FR-001] Audit `scanner.ts` root-walk — File: src/core/catalog/scanner.ts · ⚠ AUDIT found detection badly misaligned with fixture conventions (looked for `hook-*`/`manifest.yaml`/`package.json`/`.py`; fixtures use `*.hook.yaml`/`*.agent.yaml`/`plugin.yaml`/`*.command.md`/`check.sh`). Realigned. Verify ✅: scan returns one entry per artifact.
- [x] T017 [FR-001] Confirm type detection for all 8 types — File: src/core/catalog/scanner.ts · Verify ✅: `qm scan fixtures` → added=8, errors=0; integration test asserts all 8 present.
- [x] T018 [FR-001] Add detector for missing types — File: src/core/catalog/scanner.ts · Verify ✅: convention-driven detection rewritten (suffix/name based) + js-yaml metadata; all 8 covered.
- [x] T019 [FR-001] Wire `qm scan [roots] [--incremental]` — File: src/cli/commands/scan.ts · Verify ✅: `qm scan tests/fixtures/library/mixed --json` → {ok,added:8,errors:0}; reads roots from config when omitted.
- [x] T020 [FR-001] Integration test: mixed nested roots → correct type per artifact — File: tests/integration/scan.test.ts · Verify ✅: rewritten to real `scanRoots` API + repaired helpers.ts; green.

### FR-002 — Preserve organizational subfolder path independent of harness layout
- [x] T021 [FR-002] Record `organizationalPath` distinct from deploy layout — File: src/core/types.ts, migrations.ts (v2), repository.ts, search.ts, scanner.ts · Verify ✅: added field + migration v2 column + persistence; artifact at `research/deep-research/` stored with that org path (integration test asserts it).
- [~] T022 [FR-002] Test: deploy to flat harness does not mutate recorded library path — File: tests/integration/scan.test.ts (org-path part done) · Org path is recorded + tested. The deploy-doesn't-mutate-it half is verified in Phase 5 (flatten, T107) once deploy is wired.

### FR-003 — Parse and record metadata
- [x] T023 [FR-003] Parse skill frontmatter (name, description, version) — File: src/core/catalog/scanner.ts · Verify ✅: js-yaml frontmatter → metadata; test asserts Deep Research / description / 1.0.0.
- [x] T024 [FR-003] Parse plugin manifest fields — File: src/core/catalog/scanner.ts · Verify ✅: plugin.yaml name/description captured; test asserts review-plugin.
- [x] T025 [FR-003] Metadata parse for remaining types (agent, hook, mcp, output-style) — File: src/core/catalog/scanner.ts · Verify ✅: yaml/json/frontmatter parsed per type via js-yaml; metadata populated where declared.
- [x] T026 [FR-003] Test declared metadata reflected — File: tests/unit/catalog.test.ts · Verify ✅: `bun test catalog` green (metadata block).

### FR-004 — Detect & record required runtime capabilities
> ⚠ This is the spec's own Risk #1 (inference is imperfect → wrong verdicts). It is the product's crux, not a checkbox.
- [x] T026a [FR-004] SPIKE — decide capability-inference design: per-type detection signals, conservative-default policy (bias toward over-declaring capability so verdicts fail safe), dialect detection, and confidence/override hooks. Write decision doc. — File: specs/001-quartermaster/design/capability-inference.md · Verify: doc enumerates signal→capability rules per type + default-bias policy, reviewed before T027
- [x] T027 [FR-004] Audit `capabilities.ts` → single source of truth — File: src/core/catalog/capabilities.ts, scanner.ts · ⚠ AUDIT: `inferCapabilities` existed but was never called (scanner assigned caps inline = two sources). Routed scanner buildArtifact → `inferCapabilities`. Verify ✅: per-artifact capability set derived from type+metadata.
- [x] T028 [FR-004] Rule: plugin bundling a hook → hook capability — File: src/core/catalog/capabilities.ts · ⚠ found `unionPluginCapabilities` only read `components[]`; fixture plugin declares top-level `hooks:`. Extended to read top-level hooks/mcp/commands/mcpServers. Verify ✅: test asserts fixture plugin requires `hooks`.
- [~] T029 [FR-004] Rule: artifact referencing MCP server → MCP capability — File: src/core/catalog/capabilities.ts · Plugin-level `mcp`/`mcpServers` → mcp capability DONE. Skill-body MCP-reference scanning is a refinement (no fixture yet); deferred, low priority per spike doc.
- [x] T030 [FR-004] Rule: pure skill → only skill support — File: src/core/catalog/capabilities.ts · Verify ✅: test asserts pure skill capabilities === ['skill'].
- [x] T031 [FR-004] Capture capability dialect — File: src/core/catalog/capabilities.ts · Verify ✅: hook reads `metadata.dialect`; mcp single/multi dialect; plugin hook dialect from manifest.
- [x] T032 [FR-004] Test capability inference — File: tests/unit/catalog.test.ts · Verify ✅: capability block green. (Spike decisions recorded in design/capability-inference.md, T026a.)

### FR-005 — Incremental rescan (added/changed/removed, skip unchanged)
- [x] T033 [FR-005] Scanner stores per-artifact content hash — File: src/core/catalog/scanner.ts · Verify ✅: SHA-256 hash persisted; used for change detection. (mtime not needed — hash is the change signal.)
- [x] T034 [FR-005] Diff: classify added / changed / removed — File: src/core/catalog/scanner.ts · Verify ✅: integration test — appending to one file → exactly 1 changed, 0 removed.
- [x] T035 [FR-005] Unchanged entries not re-reported — File: src/core/catalog/scanner.ts · Verify ✅: second scan of unchanged library → added=0, changed=0.
- [x] T036 [FR-005] Wire `qm scan --incremental` — File: src/cli/commands/scan.ts · Verify ✅: `--incremental` returns add/change/remove counts.
- [~] T037 [FR-005 | NFR-001] Perf test: incremental rescan < 2s on 1000-artifact fixture — Deferred to NFR perf phase (needs the 1000-artifact fixture, T270).

### FR-006 — Search & filter by type, capability, source, path, free text
- [x] T038 [FR-006] Audit `search.ts` filter predicates (type, capability, source, path) — File: src/core/catalog/search.ts · Verify ✅: type filter test green; predicates work on fixtures.
- [x] T039 [FR-006] Free-text search across name/path/metadata — File: src/core/catalog/search.ts · Verify ✅: `search "Deep Research"` → 1 hit.
- [x] T040 [FR-006] Query "all requiring hook capability" returns exactly those — File: src/core/catalog/search.ts · Verify ✅: `list --capability hooks` → 2 (hook + hook-bundling plugin); test asserts all results carry the capability.
- [x] T041 [FR-006] Wire `qm list` / `qm search` with filter flags + `--json` — File: src/cli/commands/catalog.ts · Verify ✅: both wired to listCommand; `--json` parseable; filters: type/capability/source/path/text.
- [~] T042 [FR-006 | NFR-003] Perf test: search < 1s on 1000-artifact fixture — Deferred to NFR perf phase (needs 1000-artifact fixture, T270).

---

## Phase 2 — Source & Upstream Currency (FR-010 … FR-014)
Depends on: Phase 1. Records where artifacts come from and keeps them current.

### FR-010 — Record provenance for every imported artifact
- [ ] T043 [FR-010] Confirm Source record fields (kind, reference, importedRevision, pin, trusted) — File: src/core/types.ts · Verify: Source type matches spec §4
- [ ] T044 [FR-010] Persist source record on every import; mark self-authored as locally originated — File: src/core/sources/importers.ts · Verify: imported artifact has resolvable source; self-authored flagged local
- [ ] T045 [FR-010] Test: every imported fixture has a source record — File: tests/integration/sync.test.ts · Verify: `bun test sync` covers provenance

### FR-011 — Import from git repo, git subdir, marketplace, local path
- [ ] T046 [FR-011] Confirm git clone/import path in `git.ts` + `importers.ts` — File: src/core/sources/git.ts · Verify: import from a local git fixture succeeds
- [ ] T047 [FR-011] Implement git-subdirectory import (sparse/subtree) — File: src/core/sources/importers.ts · Verify: subdir import catalogs only that subdir
- [ ] T048 [FR-011] Implement marketplace entry import — File: src/core/sources/importers.ts · Verify: marketplace fixture imports with correct source kind
- [ ] T049 [FR-011] Implement local-path import — File: src/core/sources/importers.ts · Verify: local path import produces local source record
- [ ] T050 [FR-011] Wire `qm import <source>` with kind auto-detect + flag override — File: src/cli/commands/import.ts · Verify: all four source forms import via CLI
- [ ] T051 [FR-011] Integration test: four source forms → correct source records — File: tests/integration/sync.test.ts · Verify: `bun test sync` green

### FR-012 — Check upstream currency: unchanged / ahead / conflict
> ⚠ Confirmed unimplemented today (`sync.ts:98-104`, `git.ts:64/73` all return null). The conflict *model* is undecided, not just unwritten.
- [ ] T051a [FR-012] SPIKE — decide sync/conflict model: revision-compare strategy, local-modification detection (import-hash vs current content), what constitutes "ahead" vs "conflict", and confirm-to-overwrite semantics. Write decision doc. — File: specs/001-quartermaster/design/sync-model.md · Verify: doc defines the three states + detection method + overwrite gate; downstream T052–T064 may be reclassified per this decision
- [ ] T052 [FR-012] Implement `fetchUpstreamRef` for git (currently returns null) — File: src/core/sources/sync.ts · Verify: returns real remote revision for git fixture
- [ ] T053 [FR-012] Implement `fetchUpstreamRef` for github/marketplace — File: src/core/sources/sync.ts · Verify: returns upstream ref for github fixture
- [ ] T054 [FR-012] Compute per-artifact status: unchanged / ahead / conflict (upstream advanced + local edit) — File: src/core/sources/sync.ts · Verify: advanced upstream + local edit → ahead + conflict
- [ ] T055 [FR-012] Detect local modification via stored import hash vs current content — File: src/core/sources/sync.ts · Verify: edited artifact flagged locally-modified
- [ ] T056 [FR-012] Wire `qm sync --check` (report only) — File: src/cli/commands/sync.ts · Verify: report lists per-artifact status
- [ ] T057 [FR-012] Test the acceptance scenario exactly — File: tests/integration/sync.test.ts · Verify: ahead+conflict case asserted

### FR-013 — Update clean upstreams; never silently overwrite local edits
- [ ] T058 [FR-013] Update artifacts with advanced upstream AND no local mod — File: src/core/sources/sync.ts · Verify: clean artifact updated to new revision
- [ ] T059 [FR-013] Block overwrite of locally modified artifacts without `--confirm` — File: src/core/sources/sync.ts · Verify: modified artifact untouched without confirm
- [ ] T060 [FR-013] Wire `qm sync` + `qm sync --confirm` — File: src/cli/commands/sync.ts · Verify: confirm flag applies overwrite, default does not
- [ ] T061 [FR-013] Test: locally modified never silently overwritten — File: tests/integration/sync.test.ts · Verify: assertion passes

### FR-014 — Pin artifact/source to a revision
- [ ] T062 [FR-014] Add pin state + pinned revision to source/artifact — File: src/core/types.ts · Verify: pin fields present
- [ ] T063 [FR-014] Sync skips pinned artifacts/sources — File: src/core/sources/sync.ts · Verify: pinned artifact stays at pinned revision across sync
- [ ] T064 [FR-014] Wire `qm pin <artifact> <rev>` / `qm unpin` — File: src/cli/commands/sync.ts · Verify: pin then sync = no advance; unpin then sync = advances
- [ ] T065 [FR-014] Test pin persistence across syncs — File: tests/integration/sync.test.ts · Verify: assertion passes

---

## Phase 3 — Harness Profiles (FR-020 … FR-023)
Depends on: Phase 0 (types). Profiles are data; audit & deploy must need no harness-specific code.

### FR-020 — Declarative profile schema
- [ ] T066 [FR-020] Audit profile schema: types, capabilities, per-type global+project paths, flat flag, config format, guidance filename — File: src/core/profiles/profile-registry.ts · Verify: schema has every field in FR-020/spec §4
- [ ] T067 [FR-020] Add JSON-schema/validator for profiles (reject malformed) — File: src/core/profiles/profile-registry.ts · Verify: malformed profile rejected with reason
- [ ] T068 [FR-020 | NFR-040] Confirm audit/deploy read profile data only (no per-harness branches) — File: src/core/audit/auditor.ts · Verify: grep shows no hardcoded harness names in engines
- [ ] T069 [FR-020] Unit test: a profile fully drives audit with no code change — File: tests/unit/profile-schema.test.ts · Verify: `bun test profile` green

### FR-021 — Built-in profiles: Claude Code, Codex, Antigravity, OpenCode
- [ ] T070 [FR-021] Verify Claude Code profile (skill dir, flat req, hook support, MCP format) — File: src/core/profiles/profile-registry.ts · Verify: fields match current CC conventions
- [ ] T071 [FR-021] Verify Codex profile (AGENTS.md guidance, paths, config format) — File: src/core/profiles/profile-registry.ts · Verify: fields correct
- [ ] T072 [FR-021] Verify Antigravity profile — File: src/core/profiles/profile-registry.ts · Verify: fields correct
- [ ] T073 [FR-021] Verify OpenCode profile — File: src/core/profiles/profile-registry.ts · Verify: fields correct
- [ ] T074 [FR-021] Test each built-in profile's skill dir / flat / hook / MCP fields — File: tests/unit/profile-schema.test.ts · Verify: per-profile assertions green

### FR-022 — Developer-defined custom profiles (pi, oh-my-pi, Hermes, ante)
- [ ] T075 [FR-022] Load custom profiles from a profiles directory (data, not code) — File: src/core/profiles/profile-registry.ts · Verify: dropping a YAML/JSON profile registers it
- [ ] T076 [FR-022] Wire `qm profile add/edit/list/validate` — File: src/cli/commands/profile.ts · Verify: custom profile appears in list and validates
- [ ] T077 [FR-022] Test: custom profile participates in audit identically to built-in — File: tests/unit/profile-schema.test.ts · Verify: custom profile audited like built-in

### FR-023 — Profiles are versionable, shareable data
- [ ] T078 [FR-023] Editing a profile field changes subsequent deploys with no program update — File: src/core/profiles/profile-registry.ts · Verify: change skill dir → next plan uses new dir
- [ ] T079 [FR-023] Add profile version field + change-safe load — File: src/core/profiles/profile-registry.ts · Verify: versioned profile loads; test asserts deploy reflects edit

---

## Phase 4 — Compatibility Audit (FR-030 … FR-034)
Depends on: Phases 1 & 3 (capabilities + profiles).

### FR-030 — Compute verdict (deployable / transform / incompatible)
- [ ] T080 [FR-030] Audit `auditor.ts` verdict function is pure + deterministic — File: src/core/audit/auditor.ts · Verify: same inputs → same verdict, no side effects
- [ ] T081 [FR-030] Type-not-supported → incompatible with reason — File: src/core/audit/auditor.ts · Verify: hook vs no-hook harness = incompatible
- [ ] T082 [FR-030] Capability-not-supported → incompatible — File: src/core/audit/auditor.ts · Verify: unsupported capability = incompatible
- [ ] T083 [FR-030] All supported → deployable — File: src/core/audit/auditor.ts · Verify: skill vs skill-supporting harness = deployable
- [ ] T084 [FR-030] Unit test verdict truth table — File: tests/unit/audit.test.ts · Verify: `bun test audit` green

### FR-031 — Human-readable reason on non-deployable verdicts
- [ ] T085 [FR-031 | NFR-050] Every non-deployable verdict carries a plain-language reason naming the driver — File: src/core/audit/auditor.ts · Verify: each incompatible/transform verdict has reason string
- [ ] T086 [FR-031] Test: reason names the specific capability/convention — File: tests/unit/audit.test.ts · Verify: assertion on reason content

### FR-032 — Identify transform-required + name the transform
- [ ] T087 [FR-032] Audit `transforms.ts` registry (flatten, config-translate) — File: src/core/audit/transforms.ts · Verify: registered transforms enumerable
- [ ] T088 [FR-032] Nested skill vs flat-only → transform verdict named "flatten" — File: src/core/audit/auditor.ts · Verify: verdict = transform, name = flatten
- [ ] T089 [FR-032] Config-format mismatch with translator → transform named — File: src/core/audit/auditor.ts · Verify: verdict = transform, name = config-translate
- [ ] T090 [FR-032] Dialect mismatch with translator → transform; without → incompatible — File: src/core/audit/auditor.ts · Verify: both branches tested
- [ ] T091 [FR-032] Test transform identification + naming — File: tests/unit/audit.test.ts · Verify: assertions green

### FR-033 — Compatibility matrix across all artifacts × harnesses
- [ ] T092 [FR-033] Implement `computeCompatibilityMatrix` (artifacts × profiles) — File: src/core/audit/auditor.ts · Verify: returns 2D verdict grid
- [ ] T093 [FR-033 | NFR-002] Perf: matrix of 1000×10 < 5s — File: tests/integration/audit.test.ts · Verify: timed assertion passes
- [ ] T094 [FR-033] Wire `qm audit --matrix` (+ `--json`) — File: src/cli/commands/audit.ts · Verify: matrix view shows safe/transform/blocked per harness
- [ ] T095 [FR-033] Integration test for matrix view — File: tests/integration/audit.test.ts · Verify: `bun test audit` green

### FR-034 — Manual verdict override with note
- [ ] T096 [FR-034] Store override (artifactId, harness, status, note) — File: src/core/audit/auditor.ts · Verify: override persisted
- [ ] T097 [FR-034] Override supersedes computed verdict; reason marks "manual override" — File: src/core/audit/auditor.ts · Verify: overridden verdict honored + labeled
- [ ] T098 [FR-034] Wire `qm audit override <artifact> <harness> --status --note` — File: src/cli/commands/audit.ts · Verify: override visible in matrix
- [ ] T099 [FR-034] Test: deployment honors override; UI shows it as manual — File: tests/unit/audit.test.ts · Verify: assertions green

---

## Phase 5 — Deployment & Compilation (FR-040 … FR-048)
Depends on: Phase 4 (verdicts). The riskiest, most-decomposed phase — disk-mutating + reversible.

### FR-040 — Compile deployment plan (placements, method, transform, skips+reasons)
- [ ] T100 [FR-040] Audit `plan.ts` compile: enumerate placements before any write — File: src/core/deploy/plan.ts · Verify: plan lists every placement with target+method
- [ ] T101 [FR-040] Plan records transformation per placement — File: src/core/deploy/plan.ts · Verify: transform-required artifacts show transform in plan
- [ ] T102 [FR-040 | NFR-050] Plan lists every skipped artifact with reason — File: src/core/deploy/plan.ts · Verify: incompatible artifacts appear in skips with reason
- [ ] T103 [FR-040] Plan is pure (no disk writes during compile) — File: src/core/deploy/plan.ts · Verify: compiling a plan touches no files
- [ ] T104 [FR-040] Wire `qm deploy <harness>` to print plan — File: src/cli/commands/deploy.ts · Verify: plan printed with placements/methods/transforms/skips
- [ ] T105 [FR-040] Test plan completeness on fixtures — File: tests/integration/deploy-preview.test.ts · Verify: `bun test deploy-preview` green

### FR-041 — Flatten nested layout for flat-only harness; library nesting intact
> ⚠ Spec leaves collision behavior undefined: two nested artifacts can flatten to the same target name.
- [ ] T105a [FR-041] SPIKE — decide flatten collision policy: namespacing/disambiguation scheme, deterministic naming, and report-and-skip vs auto-rename when names clash. Write decision doc. — File: specs/001-quartermaster/design/flatten-collisions.md · Verify: doc defines collision rule + a worked two-skill-clash example, reviewed before T106
- [ ] T106 [FR-041] Audit `flatten.ts` name-collision-safe flattening — File: src/core/deploy/flatten.ts · Verify: nested fixtures flatten without collisions
- [ ] T107 [FR-041] Confirm flatten never mutates library, only target layout — File: src/core/deploy/flatten.ts · Verify: library paths unchanged post-deploy
- [ ] T108 [FR-041] Test: every previously-nested artifact discoverable on flat harness — File: tests/integration/deploy-preview.test.ts · Verify: assertion passes

### FR-042 — Prefer link, fall back to copy
- [ ] T109 [FR-042] Audit `placer.ts` link path + copy fallback detection — File: src/core/deploy/placer.ts · Verify: link used when available, copy when not
- [ ] T110 [FR-042 | NFR-020] WSL/Windows non-symlink → graceful copy fallback — File: src/core/deploy/placer.ts · Verify: simulated no-symlink env deploys via copy
- [ ] T111 [FR-042] Linked edit propagates without redeploy — File: src/core/deploy/placer.ts · Verify: edit library file → linked target reflects it
- [ ] T112 [FR-042] Test link + copy paths — File: tests/integration/deploy-preview.test.ts · Verify: both branches asserted

### FR-043 — Translate canonical config (e.g. MCP) per target format
- [ ] T113 [FR-043] Audit `config-writer.ts` canonical→target translation — File: src/core/deploy/config-writer.ts · Verify: one MCP def → two target formats
- [ ] T114 [FR-043] Add translators for each harness's MCP/config dialect — File: src/core/deploy/config-writer.ts · Verify: each built-in profile's config format produced
- [ ] T115 [FR-043] Test: one canonical MCP definition deploys to two differing harnesses — File: tests/integration/deploy-preview.test.ts · Verify: assertion passes

### FR-044 — Exclude incompatible automatically; deploy all compatible
- [ ] T116 [FR-044] Plan excludes incompatible, includes all compatible — File: src/core/deploy/plan.ts · Verify: 1 incompatible present → rest still deploy
- [ ] T117 [FR-044] Test acceptance scenario — File: tests/integration/deploy-preview.test.ts · Verify: assertion passes

### FR-045 — Dry-run by default; apply on confirm; `--yes` non-interactive
- [ ] T118 [FR-045] Implement dry-run plan presentation + confirmation gate — File: src/core/deploy/plan.ts · Verify: default shows plan, waits
- [ ] T119 [FR-045] Wire `qm deploy ... --yes` non-interactive apply — File: src/cli/commands/deploy.ts · Verify: `--yes` applies without prompt
- [ ] T120 [FR-045] Test: default waits, flag applies — File: tests/integration/deploy-preview.test.ts · Verify: assertions green

### FR-046 — Record applied deployment; reversible to prior on-disk state
> ⚠ Known bug: rollback restores from library source, not the actual prior on-disk bytes. Correct version is a transactional snapshot subsystem, not a one-line fix.
- [ ] T120a [FR-046 | NFR-012] SPIKE — decide deploy-transaction + snapshot model: what prior state to capture (bytes/inode/symlink target), journal format, ordering for atomic-ish apply, and recover-on-failure procedure. Write decision doc. — File: specs/001-quartermaster/design/deploy-transaction.md · Verify: doc defines snapshot scope + journal + recovery flow; T121–T125 implement against it
- [ ] T121 [FR-046] Audit `records.ts`: capture prior target state before overwrite (not just source path) — File: src/core/deploy/records.ts · Verify: record stores pre-existing target content/inode
- [ ] T122 [FR-046] Fix rollback to restore actual prior content, not library source — File: src/core/deploy/rollback.ts · Verify: pre-existing different file restored byte-for-byte
- [ ] T123 [FR-046 | NFR-012] Failed deploy leaves target consistent + recorded (no partial-without-record) — File: src/core/deploy/placer.ts · Verify: injected mid-deploy failure → recoverable state
- [ ] T124 [FR-046] Wire `qm rollback <deployId>` — File: src/cli/commands/deploy.ts · Verify: rollback restores pre-deploy state
- [ ] T125 [FR-046] Test deploy→rollback round trip — File: tests/integration/deploy-rollback.test.ts · Verify: `bun test deploy-rollback` green

### FR-047 — Deploy to single / named group / all harnesses
- [ ] T126 [FR-047] Support target = one harness — File: src/core/deploy/plan.ts · Verify: single-harness deploy works
- [ ] T127 [FR-047] Support target = named group of harnesses — File: src/core/deploy/plan.ts · Verify: group deploys each member in its layout/format
- [ ] T128 [FR-047] Support target = all configured harnesses in one invocation — File: src/cli/commands/deploy.ts · Verify: `qm deploy --all` deploys compatible subset everywhere
- [ ] T129 [FR-047] Test one command → every harness correct — File: tests/integration/deploy-preview.test.ts · Verify: assertion passes

### FR-048 — Scope deploy to subset (profile/tag/subtree)
- [ ] T130 [FR-048] Add `PlanOptions.scope` (tag / org-subtree / named subset) filter — File: src/core/deploy/plan.ts · Verify: scoped plan includes only subset
- [ ] T131 [FR-048] Wire `qm deploy <harness> --scope <selector>` — File: src/cli/commands/deploy.ts · Verify: only subset's compatible artifacts placed
- [ ] T132 [FR-048] Test scoped deployment — File: tests/integration/deploy-preview.test.ts · Verify: assertion passes
- [ ] T133 [FR-048 | NFR-010] Idempotency test: reapply same plan to unchanged target = no changes — File: tests/integration/deploy-rollback.test.ts · Verify: second apply reports zero changes
- [ ] T134 [FR-048 | NFR-011] Assert deploy engine never writes into library — File: tests/integration/deploy-preview.test.ts · Verify: library tree unchanged after any deploy

---

## Phase 6 — Self-Authored Artifacts (FR-050 … FR-051)
Depends on: Phases 1, 4, 5. Mostly confirming the same path applies.

### FR-050 — Create/edit artifacts in any subfolder, every type
- [ ] T135 [FR-050] Wire `qm new <type> <path>` scaffold into library subfolder — File: src/cli/commands/new.ts · Verify: new skill in subfolder created
- [ ] T136 [FR-050] Newly authored artifact is cataloged on next scan and becomes deployable — File: src/core/catalog/scanner.ts · Verify: scaffolded skill appears in catalog + plan
- [ ] T137 [FR-050] Test scaffold→catalog→deployable — File: tests/integration/scan.test.ts · Verify: assertion passes

### FR-051 — Self-authored treated identically to imported
- [ ] T138 [FR-051] Confirm audit/transform/deploy treat self-authored == imported — File: src/core/audit/auditor.ts · Verify: self-authored hook audited like imported hook
- [ ] T139 [FR-051] Test: self-authored hook audited against each harness's hook support — File: tests/unit/audit.test.ts · Verify: assertion passes

---

## Phase 7 — Status & Verification (FR-060 … FR-061)
Depends on: Phase 5 (records). `status.ts` exists; verify against reality.

### FR-060 — Report deployed artifacts, method, in-sync vs drifted
- [ ] T140 [FR-060] Audit `status.ts`: list deployed artifacts per harness with method — File: src/core/deploy/status.ts · Verify: status lists placements + link/copy
- [ ] T141 [FR-060] Drift detection: compare deployed content vs library source — File: src/core/deploy/status.ts · Verify: out-of-band target edit flagged as drift
- [ ] T142 [FR-060] Wire `qm status <harness>` (+ `--json`) — File: src/cli/commands/status.ts · Verify: status report renders
- [ ] T143 [FR-060] Test: out-of-band change flagged — File: tests/integration/deploy-rollback.test.ts · Verify: drift assertion passes

### FR-061 — Detect orphaned deployments
- [ ] T144 [FR-061] Detect target artifacts no longer in library — File: src/core/deploy/status.ts · Verify: removing library artifact surfaces prior deploy as orphaned
- [ ] T145 [FR-061] Surface orphans in `qm status` — File: src/cli/commands/status.ts · Verify: orphan listed in next status check
- [ ] T146 [FR-061] Test orphan detection — File: tests/integration/deploy-rollback.test.ts · Verify: assertion passes

---

## Phase 8 — Trust & Provenance (FR-070 … FR-071)
Depends on: Phases 2 & 5.

### FR-070 — Record provenance + surface before deployment
- [ ] T147 [FR-070] Confirm provenance (source, revision, import time) on every artifact — File: src/core/types.ts · Verify: provenance fields populated post-import
- [ ] T148 [FR-070] Surface provenance in deployment plan output — File: src/core/deploy/plan.ts · Verify: plan shows origin+revision per artifact
- [ ] T149 [FR-070] Test: provenance visible before deploy — File: tests/integration/deploy-preview.test.ts · Verify: assertion passes

### FR-071 — Scan risk indicators; flag in catalog + plans
- [ ] T150 [FR-071] Audit `risk/scanner.ts` indicators (bundled scripts, network, shell exec, secret access) — File: src/core/risk/scanner.ts · Verify: each indicator detected on a crafted fixture
- [ ] T151 [FR-071] Record risk flags in catalog — File: src/core/risk/scanner.ts · Verify: risky artifact flagged in catalog row
- [ ] T152 [FR-071] Surface risk flags in deployment plan — File: src/core/deploy/plan.ts · Verify: plan shows risk flags pre-deploy
- [ ] T153 [FR-071] Wire `qm scan-risk` / fold into `qm audit` — File: src/cli/commands/audit.ts · Verify: risk report renders
- [ ] T154 [FR-071] Test: bundled-script artifact flagged before deploy — File: tests/unit/safety.test.ts · Verify: assertion passes

---

## Phase 9 — Composition Module (FR-080, OPTIONAL)
Independently disableable; MUST NOT block core deployment. Build only after Phase 8.

- [ ] T155 [FR-080] Define Noun/Verb/Adjective composability model types — File: src/core/composition/model.ts · Verify: types compile
- [ ] T156 [FR-080] Validate chained input/output compatibility — File: src/core/composition/validate.ts · Verify: mismatch reported
- [ ] T157 [FR-080] Detect cycles in a chain (acyclic check) — File: src/core/composition/validate.ts · Verify: cyclic chain reported
- [ ] T158 [FR-080] Modifier (adjective) attaches only to enhanceable artifacts — File: src/core/composition/validate.ts · Verify: invalid modifier attachment rejected
- [ ] T159 [FR-080] Make module disableable via config flag — File: src/core/composition/index.ts · Verify: disabled module does not block deploy
- [ ] T160 [FR-080] Wire `qm compose validate` — File: src/cli/commands/compose.ts · Verify: validation runs from CLI
- [ ] T161 [FR-080] Test: mismatch/cycle reported before run; core deploy unaffected when disabled — File: tests/unit/composition.test.ts · Verify: assertions green
- [ ] T162 [FR-080] Document optional status + disable switch — File: README.md · Verify: composition documented as optional

---

## Phase 10 — Loadouts & Activation (FR-090 … FR-094)
Depends on: Phases 4 & 5. `loadouts.ts` + `manager.ts` exist; verify.

### FR-090 — Define named loadouts (sets of artifacts + pipelines, harness-independent)
- [ ] T163 [FR-090] Audit loadout model (membership of artifacts + pipelines) — File: src/core/loadouts/loadouts.ts · Verify: loadout stores members independent of harness
- [ ] T164 [FR-090] Wire `qm loadout create/add/remove/list` — File: src/cli/commands/loadout.ts · Verify: create coding/general/business loadouts with distinct membership
- [ ] T165 [FR-090] Test distinct-membership loadouts — File: tests/integration/loadouts.test.ts · Verify: `bun test loadouts` green

### FR-091 — Assign loadout to harness(es); switching changes active set
- [ ] T166 [FR-091] Audit `manager.ts` assignment + reassignment — File: src/core/loadouts/manager.ts · Verify: assign loadout → its compatible members active
- [ ] T167 [FR-091] Switching loadout updates harness's active set — File: src/core/loadouts/manager.ts · Verify: switch coding→general updates harness
- [ ] T168 [FR-091] Wire `qm loadout assign <loadout> <harness>` — File: src/cli/commands/loadout.ts · Verify: assignment deploys exactly that loadout's compatible members
- [ ] T169 [FR-091] Test assign + switch — File: tests/integration/loadouts.test.ts · Verify: assertions green

### FR-092 — Deactivate non-loadout artifacts (least destructive), keep in library
- [ ] T170 [FR-092] Deactivate via least-destructive harness mechanism (not delete from library) — File: src/core/loadouts/manager.ts · Verify: deactivated artifact removed from active set, present in library
- [ ] T171 [FR-092] Reactivation by switching loadouts works — File: src/core/loadouts/manager.ts · Verify: switching back reactivates
- [ ] T172 [FR-092] Test deactivate/reactivate — File: tests/integration/loadouts.test.ts · Verify: assertion passes

### FR-093 — Copy/move loadouts between harnesses
- [ ] T173 [FR-093] Implement loadout copy/move across harnesses (subject to verdicts) — File: src/core/loadouts/manager.ts · Verify: loadout applied to second harness in one action
- [ ] T174 [FR-093] Wire `qm loadout copy <loadout> <fromHarness> <toHarness>` — File: src/cli/commands/loadout.ts · Verify: command applies loadout to target harness
- [ ] T175 [FR-093] Test cross-harness reuse — File: tests/integration/loadouts.test.ts · Verify: assertion passes

### FR-094 — Report active loadout + active artifact count per harness
- [ ] T176 [FR-094] Report active loadout name + active artifact count/identity per harness — File: src/core/loadouts/manager.ts · Verify: status returns loadout + count
- [ ] T177 [FR-094] Surface in `qm status` / `qm loadout status` — File: src/cli/commands/status.ts · Verify: status view shows active loadout + count per harness
- [ ] T178 [FR-094] Test active-loadout reporting — File: tests/integration/loadouts.test.ts · Verify: assertion passes

---

## Phase 11 — Agentic Evaluation (FR-100 … FR-105)
Depends on: Phase 1. Provider-agnostic, advisory-only. `gateway.ts` exists.

### FR-103 — Provider-agnostic model endpoint + per-task model selection (build first; others depend on it)
> ⚠ Whole subsystem behind a few lines: transport, prompt/response schema, provider-agnostic adapter, turn/cost budget, and a deterministic mock for tests.
- [ ] T178a [FR-103 | NFR-061] SPIKE — decide eval/model integration architecture: SDK/transport, request+response JSON schema, behavior-driven provider adapter (detect quirks from response, don't hardcode), turn/cost-budget enforcement, and a mock endpoint for offline tests. Write decision doc. — File: specs/001-quartermaster/design/eval-integration.md · Verify: doc defines adapter contract + response schema + mock strategy; T179–T202 implement against it
- [ ] T179 [FR-103 | NFR-061] Audit `gateway.ts`: configurable endpoint, no vendor/subscription assumption — File: src/core/evaluation/gateway.ts · Verify: endpoint+model read from config, not hardcoded
- [ ] T180 [FR-103] Per-task model selection (bulk vs deep) — File: src/core/evaluation/gateway.ts · Verify: two tasks can use two models
- [ ] T181 [FR-103 | NFR-031] Credentials local-only, never logged/serialized — File: src/core/evaluation/gateway.ts · Verify: token absent from logs/plan
- [ ] T182 [FR-103] Config surface `qm eval config` — File: src/cli/commands/eval.ts · Verify: endpoint/model configurable via CLI
- [ ] T183 [FR-103] Test gateway routing with a mock endpoint — File: tests/unit/evaluation.test.ts · Verify: `bun test evaluation` green

### FR-100 — Grade artifact against named categories via model call
- [ ] T184 [FR-100] Implement grade: per-category scores + rationale via model — File: src/core/evaluation/grade.ts · Verify: grading returns scores+rationale (mock)
- [ ] T185 [FR-100] Accept caller-named categories — File: src/core/evaluation/grade.ts · Verify: requested categories scored
- [ ] T186 [FR-100] Wire `qm eval grade <artifact> --categories ...` — File: src/cli/commands/eval.ts · Verify: grade output rendered
- [ ] T187 [FR-100] Test non-deterministic-but-reasoned grading (mock) — File: tests/unit/evaluation.test.ts · Verify: assertion passes

### FR-101 — Compare/rank similar artifacts with reasons
- [ ] T188 [FR-101] Implement compare: ranked judgment + trade-off reasons — File: src/core/evaluation/compare.ts · Verify: two overlapping skills → ranked recommendation
- [ ] T189 [FR-101] Wire `qm eval compare <a> <b> ...` — File: src/cli/commands/eval.ts · Verify: comparison rendered
- [ ] T190 [FR-101] Test ranked comparison (mock) — File: tests/unit/evaluation.test.ts · Verify: assertion passes

### FR-102 — Single-turn (description) vs multi-turn (full body) with turn budget
- [ ] T191 [FR-102] Single-turn mode uses only metadata/descriptions — File: src/core/evaluation/grade.ts · Verify: single-turn does not read bodies
- [ ] T192 [FR-102] Multi-turn investigation reads full bodies + traverses subfolders — File: src/core/evaluation/investigate.ts · Verify: multi-turn opens skill bodies
- [ ] T193 [FR-102 | NFR-062] Developer-configurable turn budget; fail-closed on exceed — File: src/core/evaluation/investigate.ts · Verify: exceeding budget yields no proposal
- [ ] T194 [FR-102] Wire `qm eval investigate --turns N` — File: src/cli/commands/eval.ts · Verify: turn budget honored
- [ ] T195 [FR-102] Test single vs multi-turn + budget fail-closed — File: tests/unit/evaluation.test.ts · Verify: assertions green

### FR-104 — All eval output advisory; explicit accept/edit/reject; never auto-apply
- [ ] T196 [FR-104 | NFR-060] Eval outputs stored as proposals, never mutate deployed state — File: src/core/evaluation/proposals.ts · Verify: proposal does not change deploy until accepted
- [ ] T197 [FR-104] Accept/edit/reject workflow — File: src/core/evaluation/proposals.ts · Verify: accept applies, reject discards, edit modifies
- [ ] T198 [FR-104] Wire `qm proposal list/accept/reject/edit` — File: src/cli/commands/proposal.ts · Verify: proposal lifecycle from CLI
- [ ] T199 [FR-104] Test: no auto-apply; explicit accept required — File: tests/integration/evaluation-proposals.test.ts · Verify: `bun test evaluation-proposals` green

### FR-105 — Propose candidate loadouts by grouping catalog by inferred use case
- [ ] T200 [FR-105] Implement loadout proposal (group artifacts by inferred use case) — File: src/core/evaluation/propose-loadouts.ts · Verify: large catalog → named candidate loadouts + rationale
- [ ] T201 [FR-105] Wire `qm propose loadouts` — File: src/cli/commands/proposal.ts · Verify: candidate loadouts proposed
- [ ] T202 [FR-105] Test proposal generation (mock) — File: tests/integration/evaluation-proposals.test.ts · Verify: assertion passes

---

## Phase 12 — Pipelines (FR-110 … FR-113)
Depends on: Phases 10 & 11. `pipelines.ts` exists.

### FR-110 — Define named pipeline (ordered/structured grouping of skills)
- [ ] T203 [FR-110] Audit pipeline model (name, ordered members, use-case description) — File: src/core/pipelines/pipelines.ts · Verify: pipeline stores ordered skill members + description
- [ ] T204 [FR-110] Wire `qm pipeline create/add/list` — File: src/cli/commands/pipeline.ts · Verify: create pipeline referencing 2+ skills
- [ ] T205 [FR-110] Test pipeline definition — File: tests/unit/pipelines.test.ts · Verify: `bun test pipelines` green

### FR-111 — Construct candidate pipelines agentically (optionally instruction-guided)
- [ ] T206 [FR-111] Send skill descriptions (single-turn) / full bodies (multi-turn) to model for pipeline proposals — File: src/core/pipelines/propose.ts · Verify: returns named candidate pipelines + ordering + rationale
- [ ] T207 [FR-111] Accept optional developer instruction (target outcome) — File: src/core/pipelines/propose.ts · Verify: instruction influences proposal (mock)
- [ ] T208 [FR-111] Wire `qm pipeline propose [--instruction ...]` — File: src/cli/commands/pipeline.ts · Verify: candidate pipelines returned
- [ ] T209 [FR-111] Test agentic pipeline proposal (mock) — File: tests/unit/pipelines.test.ts · Verify: assertion passes

### FR-112 — Add pipeline to loadout as a unit (skills + directive together)
- [ ] T210 [FR-112] Adding pipeline to loadout includes member skills in deployment — File: src/core/loadouts/manager.ts · Verify: loadout with pipeline deploys member skills
- [ ] T211 [FR-112] Pipeline directive included in harness guidance on activation — File: src/core/loadouts/manager.ts · Verify: directive present when loadout active
- [ ] T212 [FR-112] Wire `qm loadout add-pipeline <loadout> <pipeline>` — File: src/cli/commands/loadout.ts · Verify: pipeline added as unit
- [ ] T213 [FR-112] Test pipeline-in-loadout activation — File: tests/integration/loadouts.test.ts · Verify: assertion passes

### FR-113 — Validate pipeline vs catalog (+ composition model when enabled)
- [ ] T214 [FR-113] Validate pipeline references exist in catalog — File: src/core/pipelines/validate.ts · Verify: missing-skill pipeline reported
- [ ] T215 [FR-113] When composition enabled, validate Noun/Verb/Adjective compatibility — File: src/core/pipelines/validate.ts · Verify: invalid composition reported
- [ ] T216 [FR-113] Block activation until corrected — File: src/core/loadouts/manager.ts · Verify: invalid pipeline cannot activate
- [ ] T217 [FR-113] Test validation gates activation — File: tests/unit/pipelines.test.ts · Verify: assertion passes

---

## Phase 13 — Guidance File Management (FR-120 … FR-122)
Depends on: Phases 5 & 12. `render.ts` exists.

### FR-120 — Canonical guidance file → per-harness filename/form
- [ ] T218 [FR-120] Maintain canonical guidance file in library — File: src/core/guidance/render.ts · Verify: canonical source read
- [ ] T219 [FR-120] Translate/deploy to per-harness filename (CLAUDE.md vs AGENTS.md) — File: src/core/guidance/render.ts · Verify: one source → CLAUDE.md + AGENTS.md
- [ ] T220 [FR-120] Wire guidance deploy into `qm deploy` — File: src/cli/commands/deploy.ts · Verify: guidance file placed per harness
- [ ] T221 [FR-120] Test one source → two harness filenames — File: tests/unit/guidance.test.ts · Verify: `bun test guidance` green

### FR-121 — Inject active pipeline directives into guidance
- [ ] T222 [FR-121] Inject each active pipeline's directive into deployed guidance — File: src/core/guidance/render.ts · Verify: active-loadout pipeline directive present in guidance
- [ ] T223 [FR-121] Test directive injection in managed section — File: tests/unit/guidance.test.ts · Verify: assertion passes

### FR-122 — Confine managed additions to delimited section; preserve hand-written content
- [ ] T224 [FR-122] Implement delimited managed-section markers — File: src/core/guidance/render.ts · Verify: managed block clearly delimited
- [ ] T225 [FR-122] Preserve developer content outside managed section across redeploys — File: src/core/guidance/render.ts · Verify: hand-written content survives redeploy
- [ ] T226 [FR-122] Test content preservation across redeploy — File: tests/unit/guidance.test.ts · Verify: assertion passes

---

## Phase 14 — Agent Query Interface + MCP (FR-130 … FR-132)
Depends on: Phases 1, 4. The agent-facing surface — entirely missing today.

### FR-130 — Stable CLI query interface, machine-readable output
- [ ] T227 [FR-130] Define stable query command surface + JSON schema for outputs — File: src/cli/commands/query.ts · Verify: query commands emit documented JSON
- [ ] T228 [FR-130] Query: list available skills — File: src/cli/commands/query.ts · Verify: `qm query list-skills --json` parseable
- [ ] T229 [FR-130] Query: search by capability or use case — File: src/cli/commands/query.ts · Verify: `qm query search --capability ...` returns structured results
- [ ] T230 [FR-130] Query: retrieve artifact metadata — File: src/cli/commands/query.ts · Verify: `qm query get <artifact> --json` returns metadata
- [ ] T231 [FR-130] Contract test: structured parseable results, no human interaction — File: tests/contract/agent-query-contract.test.ts · Verify: `bun test agent-query` green

### FR-131 — Agent-requested audit + scaffold via query interface
- [ ] T232 [FR-131] Query: request audit of one/more artifacts → structured result — File: src/cli/commands/query.ts · Verify: `qm query audit <artifact> --json` returns findings
- [ ] T233 [FR-131] Query: scaffold a new artifact stub of a given type → structured result — File: src/cli/commands/query.ts · Verify: `qm query scaffold <type>` creates stub + returns path
- [ ] T234 [FR-131] Contract test audit + scaffold — File: tests/contract/agent-query-contract.test.ts · Verify: assertions green

### FR-132 — Optional MCP server exposing same query ops (CLI remains primary)
- [ ] T235 [FR-132] Implement MCP server wrapping the same query operations — File: src/mcp/server.ts · Verify: MCP client reaches list/search/get/audit/scaffold
- [ ] T236 [FR-132] Make MCP optional/enable-flagged; CLI stays primary — File: src/mcp/server.ts · Verify: system fully functional with MCP disabled
- [ ] T237 [FR-132] Contract test: MCP ops == CLI ops — File: tests/contract/agent-query-contract.test.ts · Verify: parity assertion passes

---

## Phase 15 — Safety & Auditor Orchestration (FR-140 … FR-142)
Depends on: Phases 8 & 5. `safety/auditors.ts` + `findings.ts` exist.

### FR-140 — Register external auditors; invoke; normalize findings into catalog
- [ ] T238 [FR-140] Audit auditor-registry: register external auditor tools/skills — File: src/core/safety/auditors.ts · Verify: a registered scanner is invokable
- [ ] T239 [FR-140] Invoke registered auditor on an artifact — File: src/core/safety/auditors.ts · Verify: scanner runs against fixture
- [ ] T240 [FR-140] Normalize findings (safety score + categorized issues) into catalog — File: src/core/safety/findings.ts · Verify: findings recorded against artifact in normalized form
- [ ] T241 [FR-140] Wire `qm audit safety <artifact>` — File: src/cli/commands/audit.ts · Verify: findings rendered
- [ ] T242 [FR-140] Test register→invoke→normalize — File: tests/unit/safety.test.ts · Verify: `bun test safety` green

### FR-141 — Audit new imports/authored before deploy-eligible; gate on threshold
- [ ] T243 [FR-141] Audit newly imported + newly authored artifacts automatically — File: src/core/safety/auditors.ts · Verify: import/scaffold triggers audit
- [ ] T244 [FR-141] Gate deployment on developer-configurable safety threshold — File: src/core/deploy/plan.ts · Verify: below-threshold artifact blocked from deploy
- [ ] T245 [FR-141] Record override when developer explicitly overrides block — File: src/core/safety/findings.ts · Verify: override recorded with note
- [ ] T246 [FR-141] Wire threshold config + `qm audit override` — File: src/cli/commands/audit.ts · Verify: threshold configurable; override recorded
- [ ] T247 [FR-141] Test: below-threshold blocked until explicit recorded override — File: tests/unit/safety.test.ts · Verify: assertion passes

### FR-142 — Trusted allowlist; extensible to new auditors without core changes
- [ ] T248 [FR-142] Implement trusted allowlist (sources/plugins/skills) exempt from repeat auditing — File: src/core/safety/auditors.ts · Verify: allowlisted source skipped by routine audit
- [ ] T249 [FR-142 | NFR-040] New auditor registers without modifying deployment engine — File: src/core/safety/auditors.ts · Verify: new auditor participates via data/registration only
- [ ] T250 [FR-142] Wire `qm allowlist add/remove/list` — File: src/cli/commands/audit.ts · Verify: allowlist managed from CLI
- [ ] T251 [FR-142] Test allowlist skip + new-auditor extensibility — File: tests/unit/safety.test.ts · Verify: assertions green

---

## Phase 16 — Surfaces: CLI Completeness, TUI, Web (NFR-051, NFR-052)
Depends on: all feature phases. Surfaces over the same engine.

### CLI completeness (NFR-051)
- [ ] T252 [NFR-051] Audit every FR command is wired + discoverable in `qm --help` — File: src/cli/index.ts · Verify: every command above appears in help
- [ ] T253 [NFR-051] Consistent `--json` on all read commands — File: src/cli/output.ts · Verify: each read command supports `--json`
- [ ] T254 [NFR-051] Consistent nonzero exit + plain-language error on failure — File: src/cli/output.ts · Verify: failing command exits nonzero with reason
- [ ] T255 [NFR-051] End-to-end CLI quickstart test (scan→import→audit→deploy→status→rollback) — File: tests/integration/quickstart.test.ts · Verify: `bun test quickstart` green

### TUI (NFR-052, dark-mode-first)
- [ ] T256 [NFR-052] TUI shell over the engine (catalog browse) — File: src/tui/app.ts · Verify: TUI launches, lists catalog
- [ ] T257 [NFR-052] TUI compatibility matrix view — File: src/tui/views/matrix.ts · Verify: matrix renders in TUI
- [ ] T258 [NFR-052] TUI loadouts view — File: src/tui/views/loadouts.ts · Verify: loadouts render + switch
- [ ] T259 [NFR-052] TUI proposals view (accept/reject) — File: src/tui/views/proposals.ts · Verify: proposal actions work in TUI
- [ ] T260 [NFR-052] Dark-mode-first theming — File: src/tui/theme.ts · Verify: default theme dark
- [ ] T261 [NFR-052] Wire `qm tui` — File: src/cli/commands/tui.ts · Verify: `qm tui` opens interface

### Web (NFR-052, local, dark-mode-first)
- [ ] T262 [NFR-052] Local web server over the same engine — File: src/web/server.ts · Verify: server starts on localhost only
- [ ] T263 [NFR-052] Web: catalog browse — File: src/web/routes/catalog.ts · Verify: catalog page renders
- [ ] T264 [NFR-052] Web: compatibility matrix — File: src/web/routes/matrix.ts · Verify: matrix page renders
- [ ] T265 [NFR-052] Web: loadouts — File: src/web/routes/loadouts.ts · Verify: loadouts page renders
- [ ] T266 [NFR-052] Web: proposals (accept/reject) — File: src/web/routes/proposals.ts · Verify: proposal actions work
- [ ] T267 [NFR-052] Dark-mode-first web theme — File: src/web/theme.css · Verify: default theme dark
- [ ] T268 [NFR-052 | NFR-030] Confirm web surface is local-only, no telemetry — File: src/web/server.ts · Verify: binds localhost, no external calls
- [ ] T269 [NFR-052] Wire `qm web` — File: src/cli/commands/web.ts · Verify: `qm web` serves locally

---

## Phase 17 — Non-Functional Hardening & Acceptance
Depends on: all phases. Prove the NFRs that aren't already verified inline.

### Performance (NFR-001 … NFR-003)
- [ ] T270 [NFR-001] Generate 1000-artifact perf fixture — File: tests/fixtures/perf/ · Verify: fixture builds
- [ ] T271 [NFR-001] Full scan < 10s; incremental < 2s — File: tests/integration/perf.test.ts · Verify: timed assertions pass
- [ ] T272 [NFR-002] Audit 1000×10 < 5s — File: tests/integration/perf.test.ts · Verify: timed assertion passes
- [ ] T273 [NFR-003] Search < 1s on 1000 — File: tests/integration/perf.test.ts · Verify: timed assertion passes

### Reliability & Safety (NFR-010 … NFR-012)
- [ ] T274 [NFR-010] Idempotent deploy proven across full feature set — File: tests/integration/deploy-rollback.test.ts · Verify: reapply = no change
- [ ] T275 [NFR-011] Library read-only w.r.t. deploy engine (global assertion) — File: tests/integration/deploy-preview.test.ts · Verify: library hash unchanged after all operations
- [ ] T276 [NFR-012] Every disk-mutating op reversible; failed deploy recoverable — File: tests/integration/deploy-rollback.test.ts · Verify: injected failure → recoverable, recorded

### Portability (NFR-020 … NFR-021)
- [ ] T277 [NFR-020] Verify macOS + Linux + WSL paths; symlink→copy degrade — File: src/core/deploy/placer.ts · Verify: no-symlink env degrades to copy
- [ ] T278 [NFR-021] Verify full offline operation except sync/import — File: tests/integration/quickstart.test.ts · Verify: offline run of non-network commands succeeds

### Privacy (NFR-030 … NFR-031)
- [ ] T279 [NFR-030] Repo-wide check: no telemetry/analytics/usage reporting — File: tests/unit/privacy.test.ts · Verify: no external reporting calls found
- [ ] T280 [NFR-031] Repo-wide check: credentials never in plan/log/profile — File: tests/unit/privacy.test.ts · Verify: token never serialized

### Extensibility (NFR-040 … NFR-041)
- [ ] T281 [NFR-040] Add a brand-new harness via profile data alone, no code change — File: tests/unit/profile-schema.test.ts · Verify: new profile audits+deploys with zero engine edits
- [ ] T282 [NFR-041] Add a new artifact type via localized type/profile changes only — File: tests/unit/catalog.test.ts · Verify: new type catalogs+audits without engine rewrite

### Usability & Agentic (NFR-050, NFR-060 … NFR-062)
- [ ] T283 [NFR-050] Repo-wide: no silent drop; every refusal has a reason — File: tests/integration/deploy-preview.test.ts · Verify: every skip has nonempty reason
- [ ] T284 [NFR-060] Repo-wide: no model output mutates deployed state without acceptance — File: tests/integration/evaluation-proposals.test.ts · Verify: advisory-only assertion passes
- [ ] T285 [NFR-061] Provider-agnostic confirmed (swap endpoint via config) — File: tests/unit/evaluation.test.ts · Verify: second endpoint config works
- [ ] T286 [NFR-062] Multi-turn fail-closed on budget exceed (global) — File: tests/unit/evaluation.test.ts · Verify: over-budget yields no proposal

### Final acceptance
- [ ] T287 Run full suite green — File: tests/ · Verify: `bun test` all green
- [ ] T288 Typecheck + build clean — File: . · Verify: `bun x tsc --noEmit` and `bun run build` exit 0
- [ ] T289 Walk every FR acceptance scenario from spec §2 end-to-end — File: tests/integration/ · Verify: each FR's stated acceptance reproduced by a test
- [ ] T290 Update README + quickstart to match shipped commands — File: README.md, specs/001-quartermaster/quickstart.md · Verify: documented commands match `qm --help`

---

## FR → Task coverage map (traceability)

| FR | Tasks | FR | Tasks |
|----|-------|----|-------|
| FR-001 | T016–T020 | FR-080 | T155–T162 |
| FR-002 | T021–T022 | FR-090 | T163–T165 |
| FR-003 | T023–T026 | FR-091 | T166–T169 |
| FR-004 | T027–T032 | FR-092 | T170–T172 |
| FR-005 | T033–T037 | FR-093 | T173–T175 |
| FR-006 | T038–T042 | FR-094 | T176–T178 |
| FR-010 | T043–T045 | FR-100 | T184–T187 |
| FR-011 | T046–T051 | FR-101 | T188–T190 |
| FR-012 | T052–T057 | FR-102 | T191–T195 |
| FR-013 | T058–T061 | FR-103 | T179–T183 |
| FR-014 | T062–T065 | FR-104 | T196–T199 |
| FR-020 | T066–T069 | FR-105 | T200–T202 |
| FR-021 | T070–T074 | FR-110 | T203–T205 |
| FR-022 | T075–T077 | FR-111 | T206–T209 |
| FR-023 | T078–T079 | FR-112 | T210–T213 |
| FR-030 | T080–T084 | FR-113 | T214–T217 |
| FR-031 | T085–T086 | FR-120 | T218–T221 |
| FR-032 | T087–T091 | FR-121 | T222–T223 |
| FR-033 | T092–T095 | FR-122 | T224–T226 |
| FR-034 | T096–T099 | FR-130 | T227–T231 |
| FR-040 | T100–T105 | FR-131 | T232–T234 |
| FR-041 | T106–T108 | FR-132 | T235–T237 |
| FR-042 | T109–T112 | FR-140 | T238–T242 |
| FR-043 | T113–T115 | FR-141 | T243–T247 |
| FR-044 | T116–T117 | FR-142 | T248–T251 |
| FR-045 | T118–T120 | NFR surfaces | T252–T269 |
| FR-046 | T121–T125 | NFR perf | T270–T273 |
| FR-047 | T126–T129 | NFR reliability | T274–T276 |
| FR-048 | T130–T134 | NFR portability | T277–T278 |
| FR-050 | T135–T137 | NFR privacy | T279–T280 |
| FR-051 | T138–T139 | NFR extensibility | T281–T282 |
| FR-060 | T140–T143 | NFR usability/agentic | T283–T286 |
| FR-061 | T144–T146 | Foundation | T001–T015 |
| FR-070 | T147–T149 | Final acceptance | T287–T290 |
| FR-071 | T150–T154 | | |

All 62 FRs and all 23 NFRs are covered. **302 verifiable tasks** (290 base + 12 added):
- **Config foundation** (T015a–T015g, 7 tasks) — the layer holding roots, harnesses, profile dir, eval endpoints, safety threshold; referenced by ~15 downstream tasks.
- **Design spikes** (5 tasks) at the head of the five hard, product-defining clusters — each writes a decision doc under `specs/001-quartermaster/design/` that its downstream tasks implement against:
  - T026a capability inference (spec Risk #1)
  - T051a sync/conflict model (confirmed unimplemented)
  - T105a flatten collision policy (undefined in spec)
  - T120a deploy-transaction / rollback snapshot (known bug)
  - T178a eval/model integration architecture

Execute spikes before their clusters: their decisions may reclassify the "audit/confirm" tasks that follow into real implementation work.
