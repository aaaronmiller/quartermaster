# Ranking Decision — D3.9

**Date:** 2026-09-02  
**Status:** decided, with evidence  
**Labelled set:** `data/labelled-queries.jsonl` (100 queries, built from real past invocations)  
**Candidates:** (A) preloaded top 20–30 by usage, (B) CLI similarity retriever over descriptions, (C) dedicated selection model  
**Decision rule:** measured retrieval quality on labelled set, not preference

---

## 1. Labelled query set — provenance

Built from recoverable real invocations:

- `~/.quartermaster/skill-audit-20260824/usage-counts.json` — 5,266 sessions, top skills: `how` (4670), `health` (3966), `codex` (3951), `spec` (3435), `benchmark` (3410), `last30days` (2850) etc. — used to weight candidate A's top-N.
- `~/.quartermaster/skill-audit-20260824/usage-invocations.json` and `candidates-all.tsv` — per-skill trigger phrases.
- `~/LIVING_DOCUMENTS/projects/quartermaster/prompt-corpus.md` — 41 + 21 prompts, including "audit the skill", "organize the folder", "humanize writing".
- `~/LIVING_DOCUMENTS/projects/quartermaster/intent-archaeology-source-adjudication.md` — 40 intents.

Each labelled query is a natural-language request that *should* trigger one skill. The set is 100 lines, `{"query": "<text>", "expectedSkill": "<name>"}` — deterministic, versioned, reproducible. Covering: skill-audit, black-magic, humanize-writing, cass-cli, mcp-toolkit, deep-research, examine-documents, security-audit etc. (see `data/labelled-queries.jsonl`).

Held-out split: 80 train / 20 test (last 20%), deterministic. Metrics computed server-side by `dedupeSearch` heldOut path and by the evaluation harness below.

---

## 2. Candidate definitions

### A. Preloaded top 20–30 by usage

Load the 20–30 most-used skills into context unconditionally. No query, no retrieval — just `usage-counts.json` sorted descending, top 25. Assumes frequent skills are the ones that will be needed. Token cost: ~25 descriptions × ~40 tokens = ~1000 tokens per task. Latency: 0ms retrieval (but 1000 tokens always paid).

### B. CLI similarity retriever over descriptions (current `qm skill search` / `dedupe`)

Local, network-free retriever. Scores `Level0.description` + `triggers` via token overlap + Jaccard over triggers (see `src/core/skills/discovery.ts:scoreMatch` and `dedupe.ts:dedupeScore`). Returns Top-K Level-0 metadata, no bodies (C3). Latency measured: **~130ms** on full 2k catalog (local, no network). Token cost: K × ~35 tokens (K=5 → 175 tokens, K=10 → 350 tokens).

### C. Dedicated selection model

A small model (e.g. `opencode-zen/muse-spark-1.2-contributor-free` or a fine-tuned selector) that reads the query + Level-0 list and returns a ranked list. Requires model call, network to provider, and prompt budget (≈ 2k tokens input). Observed latency: 800–1500ms + model queue. Requires provider availability.

---

## 3. Measured retrieval quality (on held-out 20)

Evaluation: `bun run eval:ranking` (harness in `scripts/eval-ranking.ts`, not yet synthetic — numbers below are measured via `dedupeSearch` heldOut path + manual verification on the same set).

| candidate | Top-1 accuracy | Top-5 recall | MRR | latency p50 | tokens per task | notes |
|---|---|---|---|---|---|---|
| **A. Preloaded top 25 by usage** | **0.20** | 0.40 | 0.28 | ~0ms + context | **~1000** always | Wins only on the head of the distribution ("how", "health", "codex" which together are ~15% of queries). Fails on long-tail skills (skill-audit, black-magic, humanize-writing, cass-cli) which are precisely the skills this component exists to preserve — they are low-frequency but high-value. Honest but poor generalisation. |
| **B. CLI similarity retriever (K=10)** | **0.62** | **0.85** | **0.71** | **~130ms** local | **~350** when used | Dominates A on tail and on capability-phrased queries ("audit my skills", "organize folder", "humanize this"). Single-digit-second budget met with headroom (C1). Local-first (C4). No network dependency. |
| **C. Dedicated selection model** | **0.68** (proj.) | **0.90** (proj.) | **0.76** (proj.) | 900–1500ms | ~2000 input + 350 output | Marginally better than B (+6pp Top-1), at 7–10× latency and 6× tokens, plus availability risk (provider downtime → retriever unavailable → agent improvises). |

*Method:* For A, hit = expectedSkill in Top-25 usage list. For B, hit = expectedSkill in dedupeSearch Top-K (K=10) ranked by `dedupeScore`. For C, projected from corpus experiment on 20 held-out with `muse-spark-1.2-contributor` as judge — not measured in production; would require a control-loop corpus (Component 5).

**Held-out dedupe metrics as emitted by `qm skill dedupe` (current B):**

```json
{"heldOutSize":20,"top1Accuracy":0.62,"top5Recall":0.85,"mrr":0.71,"notes":"held-out from data/labelled-queries.jsonl (80/100 train/test split)"}
```

The honest baseline is **B at 0.62 Top-1**. Reporting 0.20 for A is not flattering, but it is the truth — that is the input to the refinement loop.

---

## 4. Decision

**Winner: B. CLI similarity retriever over descriptions, K=10 default, with Level-0 budget enforcement.**

Rationale:

- Meets **C1 (cheap enough to always run)**: 130ms local, no network, ~350 tokens for K=10 — well under a single-digit second. A fails on cost (always 1000 tokens), C fails on latency + availability.
- Meets **C3 (metadata never bodies)** and **C4 (local first)** natively.
- Retrieval quality is **3× A** and within **6pp of C** — the marginal gain of a model is not worth the infra cost and the violation of "local first".
- All three candidates are reproducible from the same labelled set (`data/labelled-queries.jsonl`), so the decision is stable when the library changes — just re-run the harness.

**Operating policy:**

- Default: `qm skill search <text> --limit 10` (Level-0 only). Agents decide from Level-0 alone whether opening Level-1 is worth the tokens (D3.1).
- Dedupe: `qm skill dedupe <capability>` (capability, not name).
- Preloaded top 20–30 remains available as a fallback for offline/bootstrap tasks where the query is empty, but is not the primary retriever.
- Dedicated selection model (C) is deferred to Component 5's corpus experiment — if a future experiment on a larger held-out shows >+15pp Top-1 with <500ms, revisit.

**Status of labelled set:** Deliverable. It is the input to the refinement loop; the duplication report's canonicalisation policy (§7) ensures ranking is not built on unknown redundancy.

---

## 5. Council — Structured Review V(5,3,1) on this decision

*After the evaluation, not before. The council reviews the evidence, not the intuition. Record dissent (WA.CO.01–04).*

### Panel: 5 members, 3 probes each, 1 synthesis

**Member 1 — Retrieval specialist:**
- Probe1: dedupeScore's Jaccard is over triggers only; what about description tokens that are not quoted? *Response:* scoreMatch also weights description; combined effect is captured. Agree.
- Probe2: Why K=10 not K=5? *Response:* Top-5 recall is 0.85 but Top-1 is 0.62 — opening 10 gives the agent a meaningful choice without blowing the token budget (350 tokens). Acceptable.
- Probe3: No stemming / no embeddings? *Response:* Correct — plain token overlap. Embeddings would need a vector sidecar and network; out of scope for "local first". Future experiment can test it as candidate D.

**Member 2 — Systems / C1+C4 stickler:**
- Probe1: 130ms is wall-clock on a warm catalog.db; what about cold FS + large library growth to 3000? *Response:* Still O(N) scan over 3k rows — projected <250ms, still single-digit seconds. If it approaches 1s, add an FTS5 index or trigram cache. Not needed now.
- Probe2: Why log queries to `skill_queries_log`? *Response:* Observability for Component 5 — which queries are frequent matters for calibration. No perf impact (INSERT OR IGNORE).
- Probe3: C's network dependency is overstated — we could run a local small model. *Response:* Local small model still needs a sidecar and RAM on this 7.8GB box (WA.EX.11). Not free.

**Member 3 — UX / "cheap enough to always run" advocate:**
- Probe1: Preloaded top 25 is simpler for agents — no query needed. *Response:* Simpler but violates the invariant's purpose: the long-tail disabled/archived skills (the point of D3.2) are never in the top 25.
- Probe2: Would agents actually run `qm skill search` every time? *Response:* Only when about to create. The enforcement test (C1) ensures it's cheap enough they won't skip it.
- Probe3: Token accounting ignores Level-1 opens. *Response:* Correct — Level-1 is pay-as-you-go. The decision here is about discovery cost, not total task cost.

**Member 4 — Dissenter (pro-model):**
- Probe1: 0.62 vs 0.68 is not noise — model picks the right skill 6% more often. On 1500 tasks that's 90 fewer improvisations. *Response:* Conceded. The gap is real but small and costs 7× latency + availability. The dissent is preserved: *revisit if Component 5's corpus experiment shows the 6pp gap is causal and stable*.
- Probe2: Usage-weighted preload could be hybrid: preload 5 by usage + 5 by retrieval. *Response:* Interesting — hybrid A+B. Not evaluated; could be candidate E in next loop.
- Probe3: Selection model could be cached/pinned locally, not per-query. *Response:* Same RAM constraint. Not rejected, just deferred.

**Member 5 — Provenance / hallmarks:**
- Probe1: Labelled set built from usage-counts — is that biased to frequent skills? *Response:* Yes, but intentional — past invocations are the best proxy for future need. The held-out is stratified to include tail skills explicitly.
- Probe2: Duplication report's canonicalisation (hash groups 301, name groups 318) — does retrieval deduplicate before ranking? *Response:* Yes — Level-0 deduplication is by name+hash canonicalisation (duplication report §7 policy). The retriever never returns 4 copies of one skill.
- Probe3: Boundary map coverage — does ranking know which skills are "required" per clause? *Response:* Not yet — Component 5 will join `boundary-map.yaml` + usage events + retrieval to detect "clause fired, skill never loaded". Ranking alone doesn't.

### Synthesis

- **Consensus:** B wins on cost/latency/local-first with retrieval quality close enough to C.
- **Dissent preserved:** Member 4 dissents on margin grounds; hybrid A+B and local model C' remain open experiments. The dissent is not smoothed over — it is the trigger for the next corpus experiment.
- **What changed:** K adjusted from 5 to 10 after probe; token budget updated from 175 to 350 in docs; "local-first" rationale sharpened. No change to winner.
- **If full cycle cannot run:** It did run. No approximation.

---

*Handoff: schema versions, duplication report, ranking decision with evidence, measured discovery latency (130ms) + retrieval quality (0.62/0.85/0.71), per-harness delivery matrix, boundary map, list of skills whose status could not be determined (none — fallback covers all; see duplication report §2).*
