---
title: Quartermaster web interface — information architecture
date: 2026-08-25
status: proposal
supersedes: the five-view read-only server in src/web/
---

# Quartermaster web interface

## What exists

Five server-rendered read-only views on port 4319: catalog, matrix, loadouts,
proposals, scope. About 35 KB of TypeScript, no client framework, no build step.
Nothing writes. Nothing groups. Nothing remembers what was decided.

## What it is for

Quartermaster's CLI can already answer "what artifacts exist" and "what is
deployed where". The web interface exists for the questions a terminal is bad
at, and there are exactly three:

1. **Is this skill any good, and how do I know?** — evidence accumulated over
   time about one artifact.
2. **Do these two skills collide, and which survives?** — a comparison whose
   inputs are two long documents.
3. **What runs after what?** — a graph, which prose cannot render.

Everything else is configuration, and configuration is the fourth page.

## Pages

### `/` — dashboard

Not a summary of the catalogue. A worklist. What changed since last visit, what
is waiting on a decision, what is failing.

    ┌ Needs a decision ────────────┐  ┌ Drift ───────────────────────┐
    │ 20 proposed grafts           │  │ 2 harnesses behind loadout   │
    │  4 description conflicts     │  │ 31 artifacts judged, since   │
    │  1 loadout swap staged       │  │    removed from catalogue    │
    └──────────────────────────────┘  └──────────────────────────────┘
    ┌ Coverage ────────────────────────────────────────────────────┐
    │ 263 skills · 89 agents-curated · 51 gstack · 39 pstack · …    │
    │ AMBIENT 000  DOMAIN 000  TOOL 000     ← the taxonomy split    │
    └──────────────────────────────────────────────────────────────┘

The coverage row is where the ambient/domain/tool split earns its place: it is
the one number that tells you whether the library is all hammers.

### `/audits` — evidence

One row per assessment, filterable by verdict, assessor, method and date.
Drill into `/skill/:id` for everything known about one artifact: description
grading history, contests entered, usage, group membership, and the invocation
graph in both directions.

This page exists so the next audit does not re-derive what this one already
established. Every claim links to the assessment row that produced it.

### `/comparisons` — contests

The head-to-head surface. Two or more skills side by side, full bodies, with the
derived rubric and per-criterion scores between them. The `SAME_TASK` question
is the primary control, not a footnote, because it is the question that decides
whether anything gets deleted — 13 of 25 contests in the 2026-08-24 audit
answered *no*, and a UI that hides it will produce deletions that lose
capability.

Actions from this page write `skill_action` rows; they never mutate a skill.

### `/combinations` — pipelines

The page prose cannot do.

A pipeline is a chain where one skill's output is the next one's input. The
node graph renders the chain; each edge is labelled with the artifact that
passes across it. Three affordances matter:

- **Ambient slots.** Skills classified AMBIENT are not part of any one chain —
  they can be inserted at any step. Render them as a palette beside the graph
  and let them be dropped onto an edge. `grill-me` dropped before step one when
  intent is unclear; a refinement loop dropped after any generation step.
- **Discovery vs authoring.** Chains found by analysis and chains the operator
  drew must be visually distinct, and the found ones must show their evidence.
- **Dead ends.** A skill whose output nothing consumes, and a skill whose input
  nothing produces, are both worth seeing. They are candidates for the second
  tier.

### `/config` — everything the CLI can do

Harnesses to manage, source folders feeding the catalogue, rules-file editing,
loadout assignment. Plus the two fields that make delegation possible from the
browser:

    QM_WORKER_HARNESS=omp
    QM_WORKER_MODEL=opencode-go/muse-spark-1.2-contributor
    QM_WORKER_CONCURRENCY=2

Written to `.env`, read by whatever enacts approved actions. The concurrency
field is not optional: a single `omp` worker costs 578 MB peak, and eleven of
them exhausted a 7 GB host during this audit. The UI should show the ceiling it
computes from available memory rather than letting a fan-out be requested
blindly.

## The interaction that matters: propose, approve, enact

Nothing in the browser mutates a skill or a harness. The chain is:

    browser → skill_action row (state=proposed)
            → operator approves (state=approved)
            → `qm action run` enacts it (state=enacted, outcome recorded)

Three reasons to keep the browser out of the write path. The CLI already has the
guard rails — the symlink-escape refusal, the batch rollback, the exit status
that now carries failure. A queue survives a closed tab. And an action that is
proposed and never approved stays visible instead of evaporating, which is
precisely what happened to twenty grafts that lived only in a Markdown file.

Drag-and-drop needs no framework. HTML5 drag events plus one `fetch` per drop is
about forty lines against the existing server-rendered markup. Multi-select plus
an operations menu turns N selected skills into N proposed rows in one request.

## Build order

1. `/skill/:id` — makes existing data useful, no new interaction model.
2. `/actions` queue — converts recommendations into tracked state.
3. `/config` + `.env` — unblocks delegated execution.
4. `/combinations` — highest value, most new interaction; do it once the data
   model has settled.
5. `/groups` drag-and-drop — most visible, least load-bearing. Grouping can be
   done by query until then; an un-enacted recommendation is lost work.

## Data

All of it in the SQLite catalogue Quartermaster already opens — see
`docs/skill-intelligence-design.md` for the schema and the argument against a
document store. Two tables need adding for this page set:

```sql
CREATE TABLE skill_kind (          -- the taxonomy
  artifact_id TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,       -- AMBIENT | DOMAIN | TOOL
  reason      TEXT,
  assessed_at TEXT NOT NULL,
  assessor    TEXT NOT NULL
);

CREATE TABLE skill_pipeline (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  origin   TEXT NOT NULL,          -- 'discovered' | 'authored'
  evidence TEXT
);
CREATE TABLE skill_pipeline_step (
  pipeline_id INTEGER NOT NULL REFERENCES skill_pipeline(id),
  position    INTEGER NOT NULL,
  artifact_id TEXT NOT NULL,
  handoff     TEXT,                -- the artifact passed to the next step
  PRIMARY KEY (pipeline_id, position)
);
```

`skill_kind` is what makes `/combinations` tractable: filtering to DOMAIN and
TOOL removes most of the library from pipeline contention, and AMBIENT becomes
the palette rather than noise in the graph.
