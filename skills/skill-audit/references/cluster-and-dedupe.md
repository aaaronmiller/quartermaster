# Clusters and duplicates

How to find skills that overlap, decide what the overlap is, and resolve it
without deleting something that was never competing.

## Contents

1. Categories
2. Relation types
3. Candidate pairs: where duplicates hide
4. The cluster procedure
5. Merging well
6. Bias controls
7. Recording the decision
8. Intake: adopting a new skill

## 1. Categories

Every skill gets one primary category from `taxonomy.md`, an optional
secondary category, and up to three tags. Skills that run several gates
(create, implement, audit) take the category of their main gate as primary
and the next as secondary, and are compared against the skills of both.

## 2. Relation types

| Relation | Meaning | Resolution |
| --- | --- | --- |
| `exact-copy` | Same body in two places or under two names (frontmatter may differ) | Keep one source; remove the other path from every harness. A system fix. |
| `version-variant` | Same skill, diverged copies or versions | Pick the better, port what the other has that it lacks, retire the other. Exception: a version whose description declares it a compatibility pin ("preserved for projects depending on its exact behavior") stays, marked `pin`; retiring a pin is always escalated. |
| `same-task` | Different skills a request lands on equally, for the same outcome | Merge (one base plus grafts) or keep the better and retire the other. Rewritten boundaries count as a resolution only if each request then matches exactly one skill; if the claims still overlap, merge. |
| `stance-pair` | Same trigger, opposite intended outcomes (lock scope vs expand scope) | Keep both behind one choice point: one skill with modes, or descriptions that name the stance, not only the topic |
| `overlap` | Share part of their scope; each also does distinct work | Under budget in every target harness: keep both with separated triggers. Over budget anywhere: merge, narrow, or make the less-used one name-only or manual. |
| `pipeline` | Stages of one job: one's output is the other's input | Keep as stages or fold into one skill with modes; each description names its stage and the next |
| `specialization` | One is a narrow case of the other | Keep the narrow one if it wins its narrow case; narrow its triggers to that case |
| `complement` | Similar vocabulary, different jobs | Keep both; check that descriptions do not collide |

`exact-copy`, `version-variant` and `same-task` justify removal or merge.
The others justify boundaries, narrowing, modes or budget measures.

## 3. Candidate pairs: where duplicates hide

`scripts/cluster.py` proposes clusters and candidate pairs. On this kind of
collection, real duplicates with different wording score only 0.03 to 0.15
in its similarity measure (measured: `unslop`/`deslop` 0.03,
`spec-prep`/`spec-workflow` 0.09, `humanize-writing`/`stop-slop` 0.12), below
the threshold that links clusters. So the script's clusters are a batching
convenience, never evidence that two skills differ. The script also emits:

- `same_body`: skills whose bodies match once frontmatter is removed. These
  are the strongest duplicate candidates.
- `shared_phrasing`: descriptions sharing quoted phrases or whole sentences.
- `shared_openers`: descriptions opening with the same lead verb and
  object noun (a routing collision even when the jobs differ).
- `review_pairs`: every pair above a low similarity floor that the clusters
  did not put together, plus links cut when a large cluster was split.

Every `review_pairs` entry involving a batch member goes into that batch's
neighbour file. The worker records a relation, or "compared, no relation",
for each one. Untested pairs are reported as untested.

## 4. The cluster procedure

**Step 0a. Pipeline check.** If one skill's output (a fixed check, an
opened PR, a review synthesis) is another's input or trigger, and neither
alone satisfies the request end to end, the relation is `pipeline`, even
though one request fires both. Stages of one job share an outcome by
design; that is not duplication (`fix-ci` and `loop-on-ci`; a launcher like
`thermos` over the two reviews it runs).

**Step 0b. Family gate.** When four or more members share a library,
provider or domain prefix (`gsap-*`, `github-*`, a video family), decide
once: one router skill with modes when members share prerequisites and
differ only by subtopic; separate skills only when each member's triggers
exclude the others without a boundary clause. Record the decision and the
evidence, then run pairwise steps within that shape.

**Step 0c. Same-task test.** For each remaining pair, write two or three
realistic requests and ask: would each land on both skills for the same
outcome? On an earlier audit of this collection, 13 of 25 suspected pairs
were not the same task. If not, name the relation, fix the boundary, and
stop here for that pair.

Steps 1 to 5 apply to `same-task` and `version-variant` pairs only. For
other relations, the boundary or budget fix from section 2 is enough;
record why scoring was skipped.

**Step 1. Derive the rubric before comparing.** 5 to 7 criteria for what a
skill for this specific job must do, each checkable against the text
("names the font stacks and when to use each", not "good visual
direction").

**Step 2. Score 0 to 3 per criterion per skill.** 0 absent, 1 mentioned,
2 specified, 3 specified with enforceable detail. Also score each member on
its own narrowest claim with two checkable criteria; a member that scores 5
or 6 there is a `specialization` candidate whatever its total.

**Step 3. Base and grafts.** The base is the best scorer unless another is
clearly better structured to extend. Each graft names what, from where, and
where it goes (often a new mode file).

**Step 3b. Compare directives.** For the shared request, quote what each
skill prescribes (asking or not, confirmation, destructive defaults, output
style). Contradictions go into both verdicts as `cross-skill` conflicts.

**Step 4. Refusals.** Name what must not be grafted and why. A narrow
skill's content is refused by default: a skill usually wins by focus.

**Step 5. Reframe the loser.** Before recommending retirement, check what
the losing skill would win at under a different framing, using its
narrow-claim score from Step 2 as the evidence.

**Step 6. Usage.** If usage data is supplied, prefer at equal quality the
skill that serves what the operator uses. Without it, write
`usage: unknown` and cap merge or retire at medium confidence.

**Step 7. Decide.** Merge into base, keep both with partitioned triggers,
narrow, put behind modes, convert to command, name-only, retire, or
escalate with the reason.

## 5. Merging well

- The merged skill keeps the base's voice and structure; grafts arrive as
  modes or reference files, not paragraphs wedged into the body.
- Rewrite the description for the merged scope within the allowance.
- Keep the loser's unique triggers only if the merged skill now serves them.
- Record provenance in `metadata.merged-from`.
- Retired skills leave every harness listing but stay recoverable (archive
  folder or git); the decision log names where they went.

## 6. Bias controls

Models judging two texts favor the one shown first, the longer one, and
text they wrote themselves.

- Compare in both orders; count a win only when it holds both ways.
- Judge against the derived rubric, not overall impression.
- Do not reward length.
- The verifier comes from a different model family than the worker.

## 7. Recording the decision

Write `clusters/<cluster>.json` (schema in `verdict-schema.md` section 3):
members, category, relation per pair, same-task requests, the family
decision if any, rubric, scores, narrow-claim scores, base, grafts,
refusals, decision per member, and the `review_pairs` tested.

## 8. Intake: adopting a new skill

Treat the candidate as a new member of the cluster it would join:

1. Search the installed collection, including disabled and archived
   skills, for the same job.
2. Run sections 3 and 4 against its nearest installed skills. Adopt only if
   it wins or fills a job nothing covers.
3. Filters: needed at least monthly; no heavy dependencies or secrets;
   works in the harnesses in use; no safety findings.
4. Cost: its description fits the allowance and adding it pushes no harness
   over budget, or something else leaves, or it is name-only.
5. If it wins only part of its scope, graft that part into the installed
   skill instead of adding a second skill.
