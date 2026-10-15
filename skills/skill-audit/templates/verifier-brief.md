# Verifier brief: skill-audit corpus mode, batch {{BATCH_ID}}

## Task

Check another model's verdicts for the skills below. Change nothing in any
skill folder. Write only `{{RUN_DIR}}/verify/<skill>.json` (section 4 of
`{{SKILL_AUDIT_DIR}}/references/verdict-schema.md`).

## Read first

`{{SKILL_AUDIT_DIR}}/SKILL.md`, `references/description-standard.md`,
`references/body-standard.md`, `references/cluster-and-dedupe.md`,
`references/verdict-schema.md`.

## For each skill in {{SKILLS}}

1. Read SKILL.md and every file it references; record your own hashes with
   `sha256sum`.
2. Before opening the worker's verdict, write 3 to 5 problems you found
   yourself into `independent`.
3. Open `{{RUN_DIR}}/verdicts/<skill>.json`. Add one `items` entry per
   finding, per relation, per comparison, per conflict, for `description.proposed`,
   for `trigger_tests`, and for `recommendation`: `confirmed` (the quote and the reasoning hold),
   `rejected` (reason plus a contradicting quote) or `unclear` (what evidence
   would decide).
4. Check `description.proposed`: within {{ALLOWANCE}} characters, passes D1
   to D10, does not collide with any description in this batch or in
   `{{RUN_DIR}}/briefs/{{BATCH_ID}}-neighbours.txt`.
5. Reject `trigger_tests` with too few queries, trivial negatives, or
   `should` queries that all contain the skill's name.
6. Under `missed`, add relations, cross-skill conflicts and blocker findings
   the worker did not record, including anything from your step 2 list.
7. Set `agreement` to confirmed divided by confirmed plus rejected, and show
   the arithmetic in `notes`.

Judge against the standards, not your taste. Do not reward length. When
comparing two skills, consider them in both orders.

## Before you stop

Run `python3 {{SKILL_AUDIT_DIR}}/scripts/check_verdicts.py {{RUN_DIR}} --require-verify`
and fix every ERROR in your own files.
