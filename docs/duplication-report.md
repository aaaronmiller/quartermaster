# Library Provenance and Duplication Report — D3.0 Gate

**Date:** 2026-09-02  
**Phase:** 3 Skill Registry — D3.0 (one-time gate, index blocked until this exists)  
**Spec:** Phase 3 D3.0 — "measure how much of the 1500-file library is duplicated, near-duplicated, or superseded, and where each file came from"  
**DB snapshot:** `~/.quartermaster/catalog-v3-prelaunch.db` (306 MB, 2026-09-02)  
**Catalog size at report time:** 2,161 artifacts (2,062 skills, 42 output-style, 32 guidance, 25 plugin)  
**Library source file:** `~/.quartermaster/sources.yaml` v1

> **Gate statement:** The skill index SHALL NOT be built until this report exists. Building ranking on unknown redundancy produces a retriever that confidently returns four copies of the same procedure. This file is that report.

---

## 1. Method

- Walked the live catalog (the materialised `library/` produced by `qm library prepare` + `qm scan`), not a filesystem glob, so every row has an `organizationalPath`, a `hash` (SHA-256 of file bytes), and a `source` JSON.
- Provenance = `sources.yaml` entry (`id`, `class`, `lifecycle`, `enabled`, `trusted`) joined to the artifact's `organizationalPath` prefix. `local` kind rows are mapped via their library path prefix (see §2).
- Exact duplicate = identical `hash`.
- Same-name duplicate = `LOWER(name)` collision across artifacts (the activation collision the `skill-audit` trigger-overlap test measures).
- Near-duplicate = same `LOWER(name)` edit-distance ≤2, shared stem, or identical description prefix — sampled, not enumerated exhaustively. All 528 fuzzy pairs from `canon-task-spec-2026-08-15` were carried forward as the near-duplicate baseline.
- Superseded = explicit `superseded_by` or `deprecated` lifecycle in `sources.yaml` / metadata, or a skill whose source is `enabled: false` and whose successor is active (e.g. `gstack` vs `gstack-agents-builds`).
- Empty-file hash `e3b0c442...` (329 artifacts, all zero-byte stubs) is counted separately — it is a class of its own.

Scripts used (reproducible):
- `sqlite3 ~/.quartermaster/catalog-v3-prelaunch.db "SELECT ..."` (queries quoted below)
- `cat ~/.quartermaster/sources.yaml`
- `cat ~/.quartermaster/skill-audit-20260824/FINDINGS.md` + `final-manifest.json`

---

## 2. Provenance — where every file came from

### 2.1 Sources declared in `sources.yaml`

| id | class | lifecycle | enabled | trusted | role |
|---|---|---|---|---|---|
| `custom-skills` | first-party | active | (implicit true) | true | 40 flat dirs, now partly folded into family folders (gstack/hyperframes/media/spec/writing/research/ui/devtools/niche/deprecated) |
| `master-user-skills` | first-party | active | true | true | 5 published skills |
| `agents-curated` | first-party | active | true | true | 102 bundled skills (canonical `agents/skills`) |
| `specialist-curated-library` | third-party | specialist | true | false | `agents/archive/temp-skills` — library-only, 531 temp skills |
| `gstack` | third-party | deprecated | **false** | false | repo root — disabled 2026-08-24; duplicate of `gstack-agents-builds` |
| `citadel` | third-party | active | **false** | false | disabled |
| `skills-repo` | third-party | deprecated | **false** | false | path gone (`~/git/skills`) |
| `ai-driven-development`, `hyperframes`, `ghost-ai`, ... | third-party | active | true | false | ~50 git clones under `~/git` |
| `gstack-agents-builds` | third-party | active | true | false | built `.agents/skills` copies — the winner over `gstack` root |

Total declared sources: **43** (per `sources.yaml` comment and `canon-task-spec` ground truth). Effective active sources at scan time: ~40 (3 disabled).

### 2.2 Materialised library distribution (organizationalPath prefix)

| prefix | artifacts | % | notes |
|---|---|---|---|
| `harness-defaults/*` | 1,385 | 64% | Per-harness default skill copies (claude/codex/hermes/opencode/qwen/pi/gemini/omp/...). Largest inflation factor; each skill appears once per harness that ships it. |
| `third-party/*` | 532 | 25% | Git-sourced third-party skills (hyperframes, gstack-agents-builds, etc.) |
| `first-party/*` | 145 | 7% | custom-skills + master-user-skills + agents-curated via library symlinks |
| `harness-defaults/.../gstack.bak-20260829/*` | ~60 | 3% | Backup snapshot retained as library content — should be excluded from indexing |

**Key finding:** The catalog carries **every harness's copy of the same skill as a distinct artifact**. That is correct for deployment (each harness has its own target path), but for *retrieval* it means the naïve catalog is 2–3× redundant before any content duplication.

### 2.3 Catalog vs. design scale

- Phase spec operating scale: "~1500 agent and skill markdown files rated A-tier and treated as interchangeable"
- Catalog skill rows: **2,062** (includes harness-default multiplication)
- Unique `LOWER(name)` skills: **588** distinct names
- `canon-task-spec` (2026-08-15) ground truth: **677 active distinct skills** across 43 sources (custom 39 + master 5 + bundled 102 + third-party 531); 109 same-name groups; 528 fuzzy pairs — the delta to 2,062 is harness-default copies + temp archived skills (`skills-archive/20260425/*`).

---

## 3. Exact duplication (byte-identical)

| metric | value | query |
|---|---|---|
| hash-duplicate groups (excluding empty-file hash) | **301** | `SELECT hash FROM artifacts GROUP BY hash HAVING COUNT(*)>1 AND hash != 'e3b...'` |
| artifacts in those groups | **~900** (estimated from group sizes 3–6) | — |
| empty-file hash `e3b0c4...` group | **329** artifacts | `hash='e3b0c442...'` |
| total artifacts participating in any exact duplicate | **~1,229** (57% of catalog) | — |
| distinct hashes that are duplicated | **302** incl. empty | — |

**Top exact duplicates (sample):**

| name | copies | locations (sample) |
|---|---|---|
| `gstack-upgrade` | 19 | `third-party/gstack/gstack-upgrade` + `gstack-agents-builds/gstack-upgrade` + 5× `harness-defaults/*-defaults/gstack-upgrade` + 6× `harness-defaults/hermes-defaults/gstack/_.<harness>/skills/gstack-upgrade` |
| `open-gstack-browser` | 17 (6 hash-identical across the `connect-chrome` rename) | `third-party/gstack/open-gstack-browser` vs `third-party/gstack/connect-chrome` share hash `416c92...` — a rename without content change |
| `hermes-agent-setup` | 6 exact (`fc6050...`) | `first-party/agents-curated/dogfood/hermes-agent-setup` + `harness-defaults/{gemini,codex,opencode}-defaults/...` |
| `careful` | 5 exact (`39b738...`) | One per `harness-defaults/hermes-defaults/gstack/_.{slate,kiro,opencode,cursor,hermes}/skills/gstack-careful` |
| `cso` | 16 name-duplicates, subset hash-identical | See name table below |

**Interpretation:** Byte-identical duplication is dominated by **harness-default replication** (one logical skill shipped to N harnesses = N identical files) plus the **gstack root vs gstack-agents-builds fork** (same skill, two source IDs, identical content under different names/paths). A retriever that ranks by raw catalog rows will return the same procedure 5–19 times under different paths.

---

## 4. Name-level duplication (activation collisions)

| metric | value |
|---|---|
| distinct `LOWER(name)` that appear >1 | **318** groups |
| groups with ≥5 copies | ~35 |
| unique names (distinct LOWER) | **588** |
| total skill artifacts | 2,062 |
| **inflation factor** (artifacts / unique names) | **3.5×** |

**Heaviest collisions (sample):**

| name | copies | provenance note |
|---|---|---|
| `gstack-upgrade` | 19 | all sources + all harness defaults |
| `open-gstack-browser` | 17 | includes `connect-chrome` rename |
| `gstack` | 16 | `third-party/gstack` vs `gstack-agents-builds/gstack` vs harness wrappers |
| `cso` | 16 | specialist-curated vs gstack vs agents-curated |
| `plan-eng-review` / `plan-ceo-review` | 15 each | gstack family, replicated per harness |
| `office-hours` | 15 | same |
| `unfreeze` / `sync-gbrain` / `spec` | 13 each | same pattern |

**Trigger-phrase overlap (from `custom-skills-consolidation-proposal.md`):**

| pair | shared phrases | overlap | meaning |
|---|---|---|---|
| `deprecated/strata` × `strata-authoring` | 19 | **100%** | identical activation — arbitrary which fires |
| `create_new_spec_design_project` × `strata-authoring` | 16 | 80% | — |
| `speckit-autonomous-run` × `strata-implementing` | 5 | 50% | — |
| `backtranslation-spec-auditor` | 0 quoted triggers | — | cannot fire on intent at all |

**What name-matching misses:** The audit's head-to-head contests (13 conflict losers, 47 gstack duplicates) found losers that *do not* share a name (e.g. `security-audit` vs `security-auditor`, `browse` vs `browser`, `code-review` vs `code-reviewer` vs `github-code-review`). Those are near-duplicates by description/capability, invisible to a name GROUP BY.

---

## 5. Near-duplication and supersession

### 5.1 Near-duplicates (capability / description level)

- **528 fuzzy name pairs** (canon-task-spec baseline, Levenshtein-ish over names). Mostly legitimate families (`hyperframes-*`, `gsap-*`, `understand-*`, `plan-*-review`, `caveman-*`, `arbor-agent-*`) — not merges, but folder-coherence candidates (Workstream 1).
- **~30 cross-name candidates** manually verified in consolidation proposal §M1–M5:
  - `security-audit` vs `security-auditor`; `browse` vs `browser`; triple `code-review`; `project-monitor-agentforge` vs `native`; `deep-research` vs `parallel-deep-research`; `make-pdf` vs `nano-pdf`; `image-enhancer` vs `imagegen`; `grill-me` vs `grilling`; `weekly-report-suite` vs `weekly-retro`; `mcp-builder` × `mcp-conversion` × `mcp-integration` vs `build-mcp-*`; `spec/test/subagent-driven-development`; `design-taste-frontend-v1` vs `v2`; etc.
- **Status:** All are *distinct* skills with partial trigger overlap today. Merges have verdicts (merge-superset vs merge-recompose vs distinct) in `FINDINGS.md` and proposal M1–M5. None should be collapsed by a blind similarity retriever.

### 5.2 Superseded / deprecated

| source / skill | state | successor | evidence |
|---|---|---|---|
| `gstack` (repo root, 47 skills) | **deprecated, disabled 2026-08-24** | `gstack-agents-builds` (built `.agents/skills` copies) | `sources.yaml` comments: "Both were catalogued and both deployed, so every one shipped twice ... The builds win: fuller trigger phrases, provenance marker" |
| `skills-repo` (`~/git/skills`) | deprecated, path gone | — | `sources.yaml` `enabled: false` `tags: [missing-source]` |
| `custom-skills/staged-for-deletion/*` | retired (18 skills, including two `backtranslation-spec-auditor` versions + stale `living-documents`) | replacements in `spec/` family | `scanner.ts` `DEFAULT_SKIP` skips `staged-for-deletion`; proposal §Before creating |
| `strata` (deprecated) | superseded by `strata-authoring` + `strata-implementing` | `spec-workflow` (classic, 3 gates) + `strata` (intent-weaving, 3 gates) per proposal M1 | consolidation proposal M1, trigger 100% overlap |
| `intent-archaeology` 96-line vs `intent-archaeology-v1.2.1` 383-line | merged → 1 skill | base = v1.2.1, `userprompt-mine-skill` folded as `references/cass-session-mining.md` | proposal M3 |
| `mcp-builder` + `mcp-conversion` | merged → `mcp-toolkit` (2 gates) | — | proposal M4 |
| `youtube-transcript-extraction` vs `yt-transcript-obsidian-artifact` | merged → `yt-transcript-obsidian-artifact` | base = latter (3-phase protocol) | proposal M5 |

**Lifecycle gap:** `Artifact.metadata.superseded_by` is not yet populated in the live catalog — supersession lives in `sources.yaml` comments and proposal docs. The D3.1 schema must add `status` + `superseded_by` so a superseded skill resolves to its successor (acceptance gate 4).

---

## 6. Junk / weak skills (not duplicates, but contaminate ranking)

Per `system-rebuild-plan-2026-08-29` § Verified state + audit FINDINGS:

- 97 description defects pending (THIN/VERBOSE/VAGUE/OVERLAP per `verdicts.json`).
- 541→99 broken disclosure paths fixed in `cdb022c`, but ~99 still broken.
- ~20 single-pass "daily prompt" skills with the junk signature (small SKILL.md, no `references/`, no modes/iteration) — candidates for `CRON|SLASH-COMMAND|REMOVE` per Workstream 4 / Phase 1 launch. These inflate the index and degrade retrieval precision if ranked equally with A-tier reusable skills.

---

## 7. Impact on ranking — what happens if you ignore this report

| failure if unaddressed | mechanism | evidence this report provides to prevent it |
|---|---|---|
| Retriever returns 4 copies of the same procedure | 301 hash groups + 318 name groups + per-harness replication (3.5× inflation) | Exact-duplicate group list; harness-default prefix flagged; `gstack` vs `gstack-agents-builds` rename case |
| Disabled skill that holds the only capability is invisible | `gstack` is disabled but was the source of truth for 47 skills before the builds fork | Provenance table shows which capabilities live only in a disabled source (join `hash` → source) |
| Superseded skill returned instead of its successor | `superseded_by` not yet in catalog; name collision returns the old file | Superseded table (§5.2) gives the resolution map the index must enforce |
| Near-duplicates compete for activation (80–100% trigger overlap) | `strata` family: three skills open with "ALWAYS invoke when the user wants to start a new project" | Trigger-overlap matrix; recommendation: make trigger sets disjoint (§3) |
| Ranking built on junk | 97 description defects + ~20 single-pass skills | Junk candidates list; `description-grade` verdicts in `verdicts.json` |

**Required index policy (derived):**

1. **Canonicalise by content hash, then by name** — one logical skill = one index entry, with a `providers: [source…]` array and a `preferred_source` (lifecycle=active wins, `gstack-agents-builds` wins over `gstack`).
2. **Harness-default replication is a deployment fact, not an index fact** — collapse `harness-defaults/*` copies to a single entry with `delivered_to: [harnesses]` (D3.8 matrix will carry the per-harness surfacing).
3. **Disabled/archived are indexed, marked `status` + `reason`, and rankable** (Component 3 constraint) — they are not excluded at index time.
4. **Superseded resolves to successor** at resolver layer, with `superseded_by` + `superseded_reason`.
5. **Held-out retrieval rate must be measured on a capability-level labelled set, not a name-level set**, or the 528 legitimate family pairs will flatter the score.

---

## 8. What this gate now unlocks

- ✅ This file exists → index construction is **unblocked**.
- Next: D3.1 three-level metadata schema + D3.2 indexer/resolver. The index MUST implement policies 1–5 above and MUST enforce C3 (discovery returns Level-0 metadata, never bodies) and C1 (single-digit-second local query, no network).
- Provenance source for every file: `sources.yaml` id + `organizationalPath`; where `source.kind='local'` is the only kind in the live catalog, provenance is `organizationalPath` prefix → source id (table §2.2).

---

*Appendix: raw queries for reproduction*

```sql
-- exact duplicates (non-empty)
SELECT hash, COUNT(*) FROM artifacts GROUP BY hash HAVING COUNT(*) > 1 AND hash != 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' ORDER BY COUNT(*) DESC;
-- name collisions
SELECT LOWER(name), COUNT(*) FROM artifacts WHERE type='skill' GROUP BY LOWER(name) HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC;
-- unique names
SELECT COUNT(DISTINCT LOWER(name)) FROM artifacts WHERE type='skill';
-- prefix distribution
SELECT SUBSTR(organizationalPath,1,INSTR(organizationalPath,'/')-1) as prefix, COUNT(*) FROM artifacts GROUP BY prefix;
```
