# Alignment Report — Phase 3 Skill Registry (D3.0–D3.9)

**Date:** 2026-09-02  
**Phase:** 3 Skill Registry Component  
**Build contract:** T0-build-contract.md v3.1 (WA.* clauses)  
**System spec:** A2-system-specification.md v2.1 §§2,4,5  
**Author:** quartermaster phase-3 primary (gpt-5.6-sol)  
**Gate:** Must exist before index construction (D3.0 is itself a gate)

---

## 1. Brownfield alignment — the four steps

### Step 1: Intent-first loop (WA.IN, WA.RE, WA.DS)

**Status: DONE prior to this phase — verified, not re-run.**

- `intent-archaeology-findings.md` was missing per 2026-08-20 `punchlist.md` and `ld-audit`; sibling pages `prompt-corpus.md` and `intent-archaeology-source-adjudication.md` existed. Cited as "half-built state that reads as evidence nobody ruled on" in the phase prompt.
- Created 2026-08-29 at `/home/cheta/LIVING_DOCUMENTS/projects/quartermaster/intent-archaeology-findings.md` (evidence: frontmatter `updated: 2026-08-29`, order 139, parent index). Body covers 16 sessions + prompt corpus extension to 2026-08-16 and dispositions. Closes the dossier gap.
- `intent-archaeology-source-adjudication.md` dispositions all 40 intents (directive.feature / correction.behavior etc.) with per-intent state (Incorporated / Deferred / etc.).
- `punchlist.md` (2026-08-20) and `system-rebuild-plan-2026-08-29.md` constitute the current intent record; `tasks.md` (Living Documents) tracks remaining work, not `specs/001-quartermaster/tasks.md` which is the frozen v3 build ledger (312/312). No re-ingest of CASS required for this gate; archaeology DB snapshot frozen 2026-07-23, with corpus extension via disk evidence to 2026-08-16 — declared in the findings page. The 2026-08-17→29 gap (QM-010/QM-011) lives in git history and dated dossier pages, not in the DB.
- Readiness gate (black-magic `intent-find` / `cass status`): not re-executed in this alignment check, but `black-magic` skill is operational per system-rebuild-plan § Verified state. No pending question was escalated as blocked without a search — WA.RE.03 satisfied at dossier level. This phase does not introduce a new blocking question that requires a recovery run; therefore no false-negative risk from a broken index.

**Conclusion:** The missing section is now present, the intent record is current, and the punchlist is the working queue. No new ledger is created for this phase; the existing dossier is adapted in place.

### Step 2: Inventory against deliverable list — dispositions

Four dispositions per the phase prompt: **KEEP** (use as-is), **ADAPT** (extend/refactor), **REPLACE** (record justification, existing cannot do it), **RETIRE** (archive, never delete).

| Deliverable | Existing artifact(s) | Disposition | Justification / what changes |
|---|---|---|---|
| **D3.0 Duplication & provenance report** | `specs/001-quartermaster/tasks.md` ledger, `skill-intelligence-design.md` proposal (5-table schema), `~/.quartermaster/skill-audit-20260824/` (275-skill audit, verdicts.json, final-manifest.json), `canon-task-spec-2026-08-15.md` (109 same-name groups, 528 fuzzy pairs), `custom-skills-consolidation-proposal.md` (trigger-collision + disclosure-integrity tests) | **REPLACE** (with a measured report) | No existing report measures the full ~1500-file library for duplicates/near-duplicates/superseded with per-file provenance. The audit covered 275 active skills (Phase 1), not the full library, and lives in loose JSON outside the catalog. The new report must be reproducible, versioned, and must gate index construction (D3.0 acceptance gate 1). The audit data is an *input*, not the deliverable. |
| **D3.1 Three-level metadata schema** | `src/core/types.ts` (`Artifact.metadata: Record<string,unknown>`, `capabilities`), `src/storage/migrations.ts` (5 migrations), `src/core/catalog/scanner.ts` (js-yaml parse, organizationalPath), `skill-intelligence-design.md` (§ schema: skill_assessment / contest / usage / group / action) | **ADAPT** | Current `Artifact` has no explicit `skillStatus` lifecycle, no `triggerPhrases`, no `costHint`, no level-0/1/2 separation. But the storage and type seams exist (metadata JSON, capabilities, migrations). Adapt by: adding `SkillStatus` enum + `skill_metadata` table (or extending `artifacts` with `skill_level0` JSON column), adding migration v6, parsing SKILL.md frontmatter for `description` + trigger phrases, and formalising Level 0/1/2 schemas. Do not replace the whole type system. |
| **D3.2 Discovery query/result schemas, indexer, resolver, `qm` CLI** | `src/cli/commands/query.ts` + `src/core/query/commands.ts` (queryArtifacts, querySearch, resolveArtifactRef, scaffoldArtifact), `src/cli/commands/catalog.ts` (listCommand), `src/core/catalog/search.ts` (searchCatalog), `docs/agent-interface.md` (stable contract), `src/mcp/server.ts` (MCP parity), `profiles/*.yaml` | **ADAPT** (keep invocation working per prompt) | The prompt: "Other components' prompts already tell agents to call it. If the interface changes shape, either keep the old invocation working or update every prompt that names it in the same change, and say which you did." Existing `qm query list-skills / search --capability / get / audit` is the interface consumers know. Adapt by: keeping every existing subcommand working (no breaking change), adding a new **skill-discovery** surface `qm skill search|get|resolve` (or extending `qm query search` with `--status` + level-0 projection) that enforces C3 (metadata never bodies) and C1 (budget test). The indexer becomes a skill-focused projection over the catalog (or a separate `skill_index` materialised view) — local-first, no network in hot path (C4). All old invocations continue to work; the new surface is additive. |
| **D3.3 Dedupe query** | `custom-skills-consolidation-proposal.md` §§ trigger collision + disclosure tests, `skill-audit/SKILL.md`, `~/.quartermaster/skill-audit-20260824/` (head-to-head contests), `src/core/relationships/suggest.ts` | **ADAPT** with new retrieval-rate harness | No existing `qm` command answers "am I about to duplicate something" by capability. The audit's pairwise trigger overlap (≥50% shared phrases) and the 109 same-name groups are the closest. Adapt by building a dedicated `qm skill dedupe --capability <phrase>` (or `qm query dedupe`) that retrieves by capability embedding/similarity over descriptions, not by name, and by wiring the audit's head-to-head data into the index. Must also emit a held-out retrieval rate honestly — new measurement harness required. |
| **D3.4 `boundary-map.yaml`, clause to skill** | None. `guidance/SYSTEM-PROMPT.md` (canonical core, garbled — "Infringement Ben Tauber … CHEAT_SHEET.md"), `docs/guidance-audit-rules.md`, `specs/001-quartermaster/spec.md` FR-001…142 | **REPLACE** (new artifact) | No clause-to-skill map exists. This is the anti-bloat artifact that lets Component 5 detect "clause fired, skill never loaded". Must enumerate every core clause that defers to a skill. Created as `boundary-map.yaml` at repo root or under `contracts/` once Component 1 publishes the canonical clause index — until then, map against the current guidance/SYSTEM-PROMPT + spec FRs and mark provisional. |
| **D3.5 Usage event emitter** | `skill-intelligence-design.md` schema (`skill_usage` table), `~/.quartermaster/skill-audit-20260824/usage-counts.json` (5,266 sessions), `src/core/evaluation/` (eval gateway), no current emitter | **ADAPT** proposal → implementation | Proposal exists but table/CLI do not. Adapt by: creating `skill_usage_events` (or `skill_events`) table via migration, and a thin `qm skill event emit --skill <id> --trigger <before_create|task_start|explicit> --openedPastLevel0 <bool> --outcome <...>` emitter. Validate against contracts schema. Without it, retire/promote decisions have no data (acceptance gate 9). |
| **D3.6 Loadout query** | `src/cli/commands/loadout.ts` + `src/core/loadouts/loadouts.ts` (create/add/assign/copy/status), `src/storage/repository.ts` loadout CRUD, `qm loadout status <harness>` | **ADAPT** | `qm loadout status <harness>` already exists but answers "what is active and how many", not "is X vetted". Adapt by adding `qm skill vetted <skill>` or `qm query vetted <skill>` (or `qm loadout vetted <skill>`) that checks active-loadout membership. Must answer without human input (gate 7). Keep existing `loadout status` working. |
| **D3.7 `qm gap` intake** | None | **REPLACE** (new) | No gap intake exists. New `qm gap` (or `qm skill gap`) with `record --capability <phrase> --context <text>` and `list` queryable surface. Feeds skill proposals per system spec. |
| **D3.8 Per-harness delivery matrix** | `profiles/*.yaml` (13 harnesses: claude-code, codex, hermes, opencode, omp, etc.), `src/core/profiles/profile-registry.ts`, `docs/how-it-operates.md` (deployment table) | **ADAPT** | Profiles exist but no matrix of "how skills are surfaced per harness and whether level-0 metadata is natively available or must be injected". Adapt by adding `delivery-matrix.yaml` (or `harness-delivery.yaml`) generated from profiles + a `qm skill matrix` (or `qm profile matrix`) query. One registry, many deliveries. |
| **D3.9 Ranking decision with evidence** | None (no labelled query set, no retrieval evaluation) | **REPLACE** (new) | No ranking decision exists. Must produce: labelled query set (from real past skill invocations where recoverable — skill-audit usage, prompt-corpus), three-candidate evaluation (preloaded top 20-30 by usage vs CLI similarity retriever vs selection model), measured retrieval quality, recorded decision, and council V(5,3,1) pass. Build artefacts: `evals/skill-ranking/` or `docs/skill-ranking-decision.md` + `data/labelled-queries.jsonl`. |

**Retirements:** None — no existing file is deleted. `staged-for-deletion/` is already the retired-material area; `specs/001-quartermaster/archive/` holds dead task lists per AGENTS.md §1 and is left alone. The only retirements that will occur are skill lifecycle transitions (active → archived/superseded), recorded in the catalog, not by file deletion.

**Keeps without change (supporting):** `src/cli/output.ts` (envelope, exit codes), `src/cli/index.ts` registry shape (additive only), `docs/agent-interface.md` contract (additive), `src/storage/migrations.ts` pattern (extended), `skills/skill-audit/` (ships with tool per proposal), `profiles/` (consumed by matrix).

### Step 3: Existing consumers — who calls the search interface

A registry interface drift that breaks these is worse than no registry.

**In-repo consumers (checked via grep):**

| Consumer | Invocation it relies on | Location | Impact if broken |
|---|---|---|---|
| Agent interface contract | `qm query list-skills`, `search --capability`, `get <ref>`, `audit <ref>`, `status <harness>`, `related <ref>`, `scaffold` | `docs/agent-interface.md`, `src/cli/commands/query.ts`, `src/mcp/server.ts` | Agents report "no skill exists" and rebuild procedures. |
| CLI help + README | `qm list`, `qm search <text>`, `qm query --json` family | `README.md`, `src/cli/index.ts:COMMANDS`, `specs/.../contracts/cli-commands.md` | User-facing discovery regresses. |
| Specs & contracts | `qm query list | search | describe | audit | scaffold --json` | `specs/001-quartermaster/plan.md:412`, `design.md:437`, `contracts/agent-query.md`, `quickstart.md` | Spec acceptance surface drifts. |
| `qm web` / `qm tui` | `qm list`/`search` data via repository | `src/web/routes/`, `src/tui/` | Local UI shows stale/empty data. |
| `qm mcp serve` | `list_skills`, `search`, `get`, `audit`, `scaffold` tools | `src/mcp/server.ts` | MCP clients lose parity with CLI. |
| Cron | `qm scan && qm sync` (daily 08:10) | `~/code/quartermaster/cronjobs/bin/qm-sync.sh`, `how-it-operates.md`, `what-to-do.md` | Library never updates; deploy drifts. |
| Other components' prompts (per phase prompt) | "search before you create" → calls `qm query search` / `qm search` | Instructed in component 2/4/5 prompts and `system-prompt-user-intent.md` | Silent failure: a clause fires, its skill is never loaded, agent improvises. |

**Cross-project consumers:** Any harness overlay that injects `qm query` as its pre-create check (Codex, Claude Code, oh-my family, agy, muse, Hermes) — enumerated in `profiles/*.yaml` (13 harnesses). The delivery matrix (D3.8) is precisely the record of how each harness surfaces level-0 metadata (natively vs injected).

**Compatibility decision:** Keep every existing `qm query ...` and `qm list/search` form working exactly as `docs/agent-interface.md` specifies (same args, same envelope, same ordering, same ambiguity error shape). New skill-registry behaviour is exposed as `qm skill ...` (new top-level command) that also satisfies the "level-0 metadata, never bodies" contract. This satisfies the phase prompt's "keep the old invocation working or update every prompt that names it in the same change" — we do the former, so no prompt sweep is required. Documented here as the chosen path.

### Step 4: Gate — this report precedes new code

This file `docs/alignment-report.md` is the gate. No index construction (D3.0→D3.1 indexing) begins until it exists, per the phase prompt's Phase 0 Step 4. The subsequent one-time gate `D3.0 Library provenance and duplication report` precedes index building regardless of what this report finds — that ordering is preserved in the task plan (`D3.0 Duplication gate` phase before `Schema and Discovery`).

---

## 2. System spec alignment (A2 §§2,4,5)

- **Component 3 is quartermaster.** The three-level progressive disclosure model (L0 always-available → L1 body → L2 deeper resources) maps onto `Artifact.metadata` vs file content vs referenced assets. Operating scale ~1500 markdown files = ~677 active skills in the live library (canon-task-spec 2026-08-15 ground truth) plus 500+ third-party skills not yet in Phase 1 scope — the index must handle the full set.
- **Contracts package (Component 1):** Enum/field names for `SkillStatus` (`proposed|active|disabled|archived|superseded`) + `superseded_by` are provisional until Component 1 publishes `agent-contracts`. This component will export its provisional schema and mark it `provisional: true`; Component 1 will promote it. No conflicting local enum may land in any consumer — CI will enforce once the package exists.
- **Observability (Component 5) interface:** Usage events (D3.5) and gap intake (D3.7) are the two event streams Component 5 consumes. Both validate against the contracts schema and carry `policy_version` once Component 1 emits it.

---

## 3. Risk & sequencing notes

- **RAM constraint (WA.EX.11):** Machine has 7.8 GB; stall condition documented; archaeology indexer needs 4 GB reserve. Index builds must be measured (`peakRSS`, duration) and bounded. Fan-out inside this phase session is capped at 4 concurrent subagents (WA.EX.09–10); bulk leaves prefer JCode headless in waves — not needed for this component (index is single-process, measured).
- **Scan performance (NFR-001):** Scanner already fixed `target/vendor/.gradle` skip; full scan 26 s with 1,657 artifacts (post-junk purge). Level-0 query must be single-digit seconds local, no network, measured in CI (C1) — enforced by a test with latency + token budget.
- **Staged loadout `optimal-2026-08`:** 263 skills, `activeLoadout` already deployed per `qm status omp` despite dossier saying `harnesses: []` — D3.6 vetted query must read live `loadouts` table, not dossier prose.

---

## 4. What this gate unblocks

With this report landed, the next gate is **D3.0 Library provenance and duplication report** — a measurement of how much of the ~1500-file library is duplicated/near-duplicated/superseded and where each file came from. Index construction (D3.1 indexing, D3.2 resolver) is blocked until D3.0 exists (acceptance gate 1). The task ledger enforces that ordering.

---

## 5. Checklist

- [x] Intent-first loop verified — missing section now present (2026-08-29)
- [x] Inventory against D3.0–D3.9 with KEEP/ADAPT/REPLACE/RETIRE and justification
- [x] Existing consumers named (in-repo + cross-project), old invocation kept working chosen
- [x] This file produced as the Phase 0 gate before new code

*Next: produce `docs/duplication-report.md` (D3.0), then proceed to schema + discovery.*
