---
title: Skill intelligence — data model and web surface
date: 2026-08-25
status: proposal
---

# Skill intelligence: keeping what the audit learned

## The problem this solves

The 2026-08-24 audit produced real findings — 25 head-to-head verdicts, 275
description gradings, dependency graphs, usage counts — and every one of them
currently lives in loose JSON and Markdown under
`~/.quartermaster/skill-audit-20260824/`. Next quarter's audit will not be able
to read them, will not know which verdicts were acted on, and will re-derive
the same conclusions at the same cost.

The audit is not a document. It is data with a shape, and the shape is stable:
an artifact is judged, against criteria, by a model, at a time, producing a
verdict, which is either enacted or not.

## Mongo or relational?

**Relational, and specifically the SQLite database Quartermaster already has.**

The data is relational in the strict sense: every question worth asking is a
join. *Which skills from source X lost a contest but were never removed?*
*Which verdicts came from a model that has since been shown unreliable?*
*Which skills are in the active loadout but were never invoked in 5,266
sessions?* Those are joins across artifact, source, verdict, loadout and usage.

Mongo would buy schema flexibility we do not need — the entity set has been
stable through the whole audit — and would cost a second datastore, a second
backup path, and a second consistency story, in exchange for making every one
of those joins harder. The catalogue is already SQLite at
`~/.quartermaster/catalog-v3-prelaunch.db`, the web server already opens it,
and `artifacts.id` is already the natural foreign key.

The one genuine argument for a document store — that model output is
free-form — is answered by storing the free-form part as a TEXT column holding
JSON. SQLite queries into JSON with `json_extract` when needed.

## Schema

Five tables, all keyed on the existing `artifacts.id`.

```sql
-- One row per judgement of one artifact against one criterion set.
CREATE TABLE skill_assessment (
  id            INTEGER PRIMARY KEY,
  artifact_id   TEXT NOT NULL REFERENCES artifacts(id),
  assessed_at   TEXT NOT NULL,          -- ISO 8601
  assessor      TEXT NOT NULL,          -- model id, or 'mechanical', or 'human'
  method        TEXT NOT NULL,          -- 'description-grade' | 'head-to-head' | 'mechanical'
  verdict       TEXT NOT NULL,          -- OK|THIN|VERBOSE|VAGUE|OVERLAP|WINNER|LOSER
  confidence    TEXT,                   -- clear|narrow|tie
  issue         TEXT,
  suggestion    TEXT,
  evidence      TEXT,                   -- JSON: scores per criterion, quoted text
  UNIQUE(artifact_id, assessed_at, assessor, method)
);

-- A contest between two or more artifacts for the same activation.
CREATE TABLE skill_contest (
  id            INTEGER PRIMARY KEY,
  label         TEXT NOT NULL,
  assessed_at   TEXT NOT NULL,
  assessor      TEXT NOT NULL,
  same_task     INTEGER,                -- 0/1/NULL — the question that decides deletion
  winner_id     TEXT REFERENCES artifacts(id),
  rationale     TEXT
);
CREATE TABLE skill_contest_member (
  contest_id    INTEGER NOT NULL REFERENCES skill_contest(id),
  artifact_id   TEXT NOT NULL REFERENCES artifacts(id),
  outcome       TEXT NOT NULL,          -- winner|loser|coexist
  graft         TEXT,                   -- what to take from this member
  graft_cost    TEXT,
  graft_verdict TEXT,                   -- worth-it|not-worth-it
  PRIMARY KEY (contest_id, artifact_id)
);

-- Observed invocation, so "unused" is measured rather than assumed.
CREATE TABLE skill_usage (
  artifact_id   TEXT NOT NULL REFERENCES artifacts(id),
  window_start  TEXT NOT NULL,
  window_end    TEXT NOT NULL,
  sessions_seen INTEGER NOT NULL,
  source        TEXT NOT NULL,          -- 'session-scan' | 'cass'
  PRIMARY KEY (artifact_id, window_start, source)
);

-- Themes are many-to-many: a skill can be both 'code review' and 'verification'.
CREATE TABLE skill_group (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  kind     TEXT NOT NULL,               -- 'theme' | 'source' | 'user'
  notes    TEXT
);
CREATE TABLE skill_group_member (
  group_id    INTEGER NOT NULL REFERENCES skill_group(id),
  artifact_id TEXT NOT NULL REFERENCES artifacts(id),
  added_by    TEXT NOT NULL,            -- 'model' | 'user'
  PRIMARY KEY (group_id, artifact_id)
);

-- A proposed change awaiting approval. This is the approve/enact queue.
CREATE TABLE skill_action (
  id           INTEGER PRIMARY KEY,
  created_at   TEXT NOT NULL,
  action       TEXT NOT NULL,           -- drop|adopt|regroup|edit-description|graft
  artifact_id  TEXT REFERENCES artifacts(id),
  target       TEXT,                    -- loadout name, group name, or skill being grafted into
  reason       TEXT NOT NULL,
  evidence_id  INTEGER REFERENCES skill_assessment(id),
  state        TEXT NOT NULL DEFAULT 'proposed',  -- proposed|approved|enacted|rejected
  decided_at   TEXT,
  decided_by   TEXT
);
```

`skill_action` is the table that closes the loop. Every recommendation this
audit produced is a row; approving one in the web UI sets `state='approved'`,
and a worker enacts it and sets `state='enacted'`. A recommendation that is
never approved stays visible as `proposed` instead of evaporating into a
Markdown file, which is exactly what happened to the twenty grafts.

## Web surface

The existing server is five read-only server-rendered views on port 4319. The
change is to add one view and make two of them writable.

### `/groups` — the new view

Two-column layout. Left: ungrouped skills, filterable by source, theme, usage
count and last verdict. Right: groups as drop targets.

Drag-and-drop needs no framework here. The server already renders HTML; the
HTML5 drag events plus one `fetch` per drop is about forty lines in
`animations.js`, posting to `POST /api/group/:id/member`. Server-rendered
markup with a small amount of progressive enhancement matches what the codebase
already does, and avoids introducing a build step for a local tool.

Select several skills, drag them onto a group, and the drop is one request.
Select several skills and choose an operation from a menu — *propose drop*,
*propose regroup*, *propose description edit* — and the result is N rows in
`skill_action` with `state='proposed'`.

### `/actions` — the approve/enact queue

A table of `skill_action` rows grouped by action type, each with its reason and
a link to the evidence that produced it. Checkboxes, then **Approve selected**.
Approved rows are picked up by `qm action run`, which enacts them and records
the outcome. Nothing is enacted directly from the browser: the button changes
`state`, and a CLI command does the work, so the audit trail and the existing
guard rails both still apply.

### `/skill/:id` — the history view

Everything known about one skill on one page: description with its grading
history, every contest it entered and the outcome, usage over time, which
groups it belongs to, which skills invoke it and which it invokes. This is the
page that makes the next audit cheap, because it answers "what did we already
decide about this, and why" without re-running anything.

### Changes to existing views

`/catalog` gains group and usage columns and a theme filter. `/loadouts` gains a
diff view between two loadouts — `qm-transition` against `optimal-2026-08` is
exactly the comparison currently being done by hand.

## Ingestion

The audit folder maps onto the schema without loss:

| file | table |
| --- | --- |
| `verdicts.json` | `skill_assessment` (method `description-grade`) |
| `mechanical.json` | `skill_assessment` (method `mechanical`) |
| `h2h/results.json`, `deep2-results/parsed.json` | `skill_contest` + `skill_contest_member` |
| `usage-counts.json` | `skill_usage` |
| `final-manifest.json` source field | `skill_group` kind `source` |
| `candidates-all.tsv` theme field | `skill_group` kind `theme` |
| the recommendations in `FINDINGS.md` | `skill_action` rows, `state='proposed'` |

CSV export falls out of SQLite for free (`.mode csv`), so the "put it in a CSV"
requirement is satisfied without choosing CSV as the storage format — which
would lose the joins that make the data worth keeping.

## Why this order

1. Schema and ingestion first, because the audit findings are perishable and
   currently live only in files that nothing reads.
2. `/skill/:id` next, because it makes the existing data useful immediately with
   no new interaction model.
3. `/actions` third, because it converts recommendations into tracked state.
4. `/groups` and drag-and-drop last. It is the most visible feature and the
   least load-bearing: grouping can be done by query until the interaction
   exists, but an un-enacted recommendation is lost work.
