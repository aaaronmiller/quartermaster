# Quartermaster — Skill Registry (Component 3)

> **keeper of the helm** — one local library, every agentic CLI. Now the **search-before-you-create** gate for ~1500 skills.

**Build** `145 pass / 0 fail` **Test** `15 pass / 0 fail` (P3 gates) **Policy** `f42df720` **License** MIT

Quartermaster is now **Component 3** of the five-component Ice-Ninja system. Its shift: from a multi-harness deploy engine to the **registry that makes `search before you create` cheap enough to actually follow**. At ~1500 interchangeable skill markdown files, loading them is impossible — progressive disclosure over descriptions is the only shape.

```
~1500 skills → Level 0 metadata (name, one-line description, trigger phrases, status, cost hint)
                ↓ single-digit seconds, no network, local first
            qm search "audit the skill" → 9 hits (including disabled/archived with reason)
                ↓ agent decides whether to open Level 1
            boundary-map.yaml prevents core re-bloat (clause fires → skill never loaded → improvisation)
```

## What Changed (P3: `e296021`)

**New deliverables — all verified:**

| Deliverable | What it does | Gate |
|---|---|---|
| `docs/duplication-report.md` | 2161 artifacts (2062 skills) measured before index — exact, same-name, near-duplicate (528 fuzzy pairs). **Index blocked until this exists.** | D3.0 |
| Level 0/1/2 schema (`src/core/skills/types.ts`) | `Level0Metadata` = name + one-line description + trigger phrases + status + cost hint + organizationalPath | D3.1 |
| `qm search` (`src/core/skills/discovery.ts`) | Level-0 only, never bodies (C3), status is filter not index-time exclusion, disabled/archived searchable with reason, superseded→successor | D3.2 |
| Dedupe (`src/core/skills/dedupe.ts`) | "Am I about to duplicate something" by capability, not name, held-out 80/20 (100 labelled queries from real invocations), retrieval rate reported honestly | D3.3 |
| `boundary-map.yaml` (32 mappings) | WA.* → skill deferral, lets Component 5 detect silent failure (clause fires, skill never loaded) | D3.4 |
| Usage emitter (`src/core/skills/events.ts`) | `skill + version + trigger + openedPastLevel0 + taskOutcome + clauseId` on load/outcome — retire/promote now have data | D3.5 |
| `qm gap` (`src/core/skills/gaps.ts`) | Recurring gaps recorded → skill proposals, pressure-relief valve keeping core from re-bloating | D3.7 |
| `docs/harness-delivery-matrix.yaml` (5 harnesses) | One registry, many deliveries (claude-code native, codex injected, etc.) | D3.8 |
| `docs/ranking-decision.md` | 100 labelled queries, 3 candidates (preloaded top 25 vs CLI retriever vs selection model) decided by measured retrieval quality, not preference | D3.9 |

**Council:** V(5,3,1) on ranking decision **after** evaluation (evidence, not intuition). Dissent preserved.

## How It Works Now

```mermaid
flowchart LR
    A[~1500 skills] --> B[qm scan → catalog]
    B --> C[duplication-report gate]
    C --> D[Level 0 index: name + trigger phrases]
    D --> E[qm search "do X" → 9 hits in <1s, no network]
    E --> F{worth opening Level 1?}
    F -->|yes| G[skill body + Level 2 resources]
    F -->|no| H[skip, no tokens spent]
    G --> I[usage event emitted]
    I --> J{recurring gap?}
    J -->|yes| K[qm gap → skill proposal]
    J -->|no| L[done]
    B --> M[boundary-map.yaml]
    M --> N[core clause → skill, detect improvisation]
```

**New rule:** `WA.PR.06` — before creating a reusable skill or rebuilding a known procedure, `qm search` including disabled/archived. A disabled skill frequently contains exactly the procedure someone is about to rebuild worse.

## Quick Start (new path)

```bash
# 1. Duplication gate (one-time, before any index)
cat docs/duplication-report.md          # 2161 artifacts, exact/same-name/near-duplicate measured

# 2. Search cheaply (always)
qm search --json "audit the skill"       # Level0 only, includes disabled with reason
qm search --json "organize the folder"   # single-digit seconds, local

# 3. Check before you build
# If qm search returns a disabled skill with the same capability, open it — do not rebuild

# 4. Record a gap instead of growing the core
qm gap "need skill for X" --json         # feeds skill proposals, keeps canonical core lean

# 5. See what defers where
cat boundary-map.yaml                    # 32 clause → skill mappings, D3.4

# 6. See per-harness delivery
cat docs/harness-delivery-matrix.yaml    # 5 harnesses, native vs injected Level0

# 7. See ranking evidence
cat docs/ranking-decision.md             # 100 labelled queries, 3 candidates, held-out rate
cat data/labelled-queries.jsonl | head   # {"query":"audit the skill","expectedSkill":"skill-audit"}

# 8. Verify
bun test tests/unit/skill-registry.test.ts  # 15 passed (D3.1-D3.8 gates)
```

## Remaining CLI (deploy still works, now secondary)

The original deploy/audit/status surfaces remain (catalog → audit → plan → deploy → status, reversible). See `qm --help` and `docs/skill-intelligence-design.md`. The new registry path is the primary value; deploy is the delivery mechanism for the single registry.

## Config

```bash
qm config list --json | jq .  # redacted secrets, local project config
qm profile list                # harness profiles (claude-code, codex, hermes, opencode, pi, cursor, antigravity)
```

## Why This Matters

- **Before:** `search before you create` was an invariant with no cheap way to follow it — agents skipped it, rebuilt procedures, core bloated.
- **After:** Level 0 search is <1s, includes disabled/archived with reasons, superseded resolves, dedupe reports honestly. The honest baseline is the input to the refinement loop (observability); a flattering one is noise.

**Handoff:** `docs/ranking-decision.md` + `boundary-map.yaml` + `docs/duplication-report.md` + `data/labelled-queries.jsonl` — measured (not believed).

**Observability hook:** `src/core/skills/events.ts` emits `skill.discovery` and `usage` events to `~/code/observability` — retire/promote decisions now have data, and `observability` can detect `clause fires, skill never loaded`.
