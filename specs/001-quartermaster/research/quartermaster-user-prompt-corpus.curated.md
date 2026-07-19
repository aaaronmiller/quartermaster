---
date: "2026-07-19"
version: "1.0.0"
status: reviewed-evidence
tags: [quartermaster, cass, user-intent, provenance]
---
# Quartermaster Curated User Prompt Corpus

This is the human-reviewed subset of the reproducible CASS extraction in
`quartermaster-user-prompts.raw.json`. It preserves exact user wording for the
substantive historical Quartermaster directives. The current 2026-07-19 request
is represented in `../QUARTERMASTER-INSTRUCTIONS.md`, where it has priority over
these older instructions.

## Method and coverage

- CASS index refreshed before extraction: 326 conversations and 52,031 messages.
- Candidate sessions returned by `cass search quartermaster`: 54.
- Unique user prompts retained in raw JSON: see the generated JSON metadata.
- Prompts included by the first-pass classifier: 19.
- Substantive historical prompts retained after individual review: 7.
- Twenty-one candidate paths exposed by CASS were Hermes database pseudo-paths
  that `cass export` could not export individually. The parent Hermes state
  database was exported, so available Hermes user content remains represented.
- Excluded material consists of unrelated work performed from the Quartermaster
  directory, interruption markers, one-word continuation messages, agent status
  text pasted back into a prompt, and delegated or synthetic prompts.

## Evidence 1: functional requirements need real decomposition

- Session: `/home/cheta/.claude/projects/-home-cheta-code-quartermaster/9a461f66-e77f-474a-9a1b-a50460c01abb.jsonl`
- Time: `2026-06-29T09:07:52.711Z`
- Raw prompt index: `78`

> the task list that is 1-18 is fundamentally broken - agents were using that as the gated feature; when in reality the functional requirements are the actual items - and each fun ctional requriement might take up to a dozen steps to complete - we need a REAL task list , that decomposes all of the fr's into the treal steps needed to make them real - and a task list that goes from 1-400 or so-mething

## Evidence 2: audit rough edges honestly

- Session: `/home/cheta/.claude/projects/-home-cheta-code-quartermaster/9a461f66-e77f-474a-9a1b-a50460c01abb.jsonl`
- Time: `2026-06-29T09:14:57.083Z`
- Raw prompt index: `79`

> honbestly , is the current refinement sufficient for the project to work? or are there rough edges?

## Evidence 3: make handoff and recovery reliable

- Session: `/home/cheta/.claude/projects/-home-cheta-code-quartermaster/9a461f66-e77f-474a-9a1b-a50460c01abb.jsonl`
- Time: `2026-06-29T09:25:37.205Z`
- Raw prompt index: `81`

> modify the agents.md first to fix the entry point if we handoff to an agent and you are mid-task when the quota expires

## Evidence 4: resume from the real checkpoint

- Session: `/home/cheta/.codex/sessions/2026/06/29/rollout-2026-06-29T05-01-59-019f1341-fbd0-7560-8c06-f229710a0291.jsonl`
- Time: `2026-06-29T12:02:59.998Z`
- Raw prompt index: `91`

> continue where the last agent tleft off. ..finish all the tasks in the tasks.md file , read the agents.md for context

The remainder of this prompt repeats the prior agent's progress report and is
retained verbatim in the raw JSON rather than duplicated here.

## Evidence 5: preserve task order

- Session: `/home/cheta/.codex/sessions/2026/06/29/rollout-2026-06-29T05-01-59-019f1341-fbd0-7560-8c06-f229710a0291.jsonl`
- Time: `2026-06-29T12:06:01.058Z`
- Raw prompt index: `92`

> continue where the last agent left off...finish each item in the tasks.md in order, read the agents.md for starting info

The remainder is repeated status context and remains in the raw JSON.

## Evidence 6: finish in canonical order

- Session: `/home/cheta/.claude/projects/-home-cheta-code-quartermaster/79023d86-629a-4757-af9b-02169d2ea15c.jsonl`
- Time: `2026-06-29T16:36:38.141Z`
- Raw prompt index: `93`

> conitnue and finish the project - read the agents.md as an entry point, and the tasks.md file is in the specs subfolder - finish all tasks in order they appear

## Evidence 7: publish, then audit against original intent

- Session: `/home/cheta/.claude/projects/-home-cheta-code-quartermaster/79023d86-629a-4757-af9b-02169d2ea15c.jsonl`
- Time: `2026-06-29T18:24:43.792Z`
- Raw prompt index: `94`

> great news - push to the cloud; then perform a feature audit based on the original documentation and any other documentation you can find

## Derived historical mandates

1. Functional requirements define the product; tasks must decompose them into
   independently verifiable implementation steps.
2. Execute the canonical task ledger in dependency order and resume from its
   real stopping point.
3. Do not accept checkmarks or status claims without observable evidence.
4. Keep the agent entry point sufficient for interruption and handoff recovery.
5. Audit the finished behavior against original design documents and report
   rough edges honestly.
