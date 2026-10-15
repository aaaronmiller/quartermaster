# Worker brief: skill-audit corpus mode, batch {{BATCH_ID}}

## Task

Audit the skills below. Write one verdict file per skill and one cluster
decision for each cluster with two or more members in this batch. Change
nothing in any skill folder. Write only inside `{{RUN_DIR}}`.

## Read these first, in full

All under `{{SKILL_AUDIT_DIR}}`: `SKILL.md`,
`references/description-standard.md`, `references/body-standard.md`,
`references/cluster-and-dedupe.md`, `references/taxonomy.md`,
`references/verdict-schema.md`.

## The batch

{{TABLE: skill | absolute path | provenance (copy it verbatim)}}

Candidate clusters: {{CLUSTERS}}. The grouping is a guess; decide the real
relations yourself. Descriptions of related skills outside this batch:
`{{RUN_DIR}}/briefs/{{BATCH_ID}}-neighbours.txt`. Compare against them too.

## Context

- Description allowance for every skill in this batch: {{ALLOWANCE}}
  characters. Use this number; do not recompute it.
- Standing rules the skills run under (conflict check): {{RULE_FILES}}.
- Usage data: {{USAGE_FILE_OR "none: write usage: unknown"}}.
- Edits for downloaded skills: {{DOWNLOADED_EDITS "blockers only"}}.

## For each skill

1. Read SKILL.md and every file it references. Run `sha256sum` on each file
   and record the output in `files_read` with the path relative to the
   skill root.
2. Write a one-sentence `summary` of what the skill does once loaded.
3. Score the description D1 to D10 (D4 is n/a when the allowance is unknown or below 120). If any fail, write `proposed` within the
   allowance. Do not count characters by hand; the checker measures.
4. Walk the B-checks and the smell catalogue. Every finding: one ID, a
   severity from the calibration table, the line number, a verbatim quote of
   20 or more characters from that exact line (shorter only when the quote is the whole line), a concrete fix. No findings: write "Checked: ..."
   in `notes`.
5. Relations and pair closure: compare against every other skill in the batch,
   every skill in the neighbour file, and every Review pair in it. For each
   review pair, run the same-task test and write one `comparisons` entry with
   the relation or `compared-no-relation`. No relation anywhere: write
   "Compared against ..." in `notes`.
6. Choose one `recommendation` and a `confidence`, following the rules in
   `verdict-schema.md` section 2.

## For each pair that might do the same job

a. Write 2 or 3 realistic user requests; would each land on both skills for
   the same outcome? If not, name the relation and fix the boundary in the
   descriptions; stop there.
b. Before scoring, write 5 to 7 checkable criteria for this job.
c. Score each skill 0 to 3 per criterion (absent, mentioned, specified,
   specified with enforceable detail).
d. Compare in both orders; count a win only if it holds both ways; set
   `order_swapped`.
e. Name the base, the grafts (what, from, where it goes) and the refusals
   (what, why). Quote what each skill prescribes for the shared request; if
   they contradict, record a `cross-skill` conflict in both verdicts.
f. Write `clusters/<cluster>.json` (section 3 of `verdict-schema.md`).

## Before you stop

Run `python3 {{SKILL_AUDIT_DIR}}/scripts/check_verdicts.py {{RUN_DIR}} --allowance {{ALLOWANCE}} --clusters`.
Fix every ERROR, run it again, and stop only at zero errors.
