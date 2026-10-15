# Corpus mode: workers, verifier, orchestrator

How to audit a whole collection with several agents so that every skill is
read in full, duplicates are seen side by side, and no verdict is trusted
without a second reader.

## Contents

1. Roles
2. Batching
3. File contract
4. Worker brief
5. Verifier brief
6. Orchestrator duties
7. Resuming and costs

## 1. Roles

| Role | Does | Choose |
| --- | --- | --- |
| Orchestrator | Plans batches, fills briefs, checks files, resolves disagreements, owns cluster decisions and the final report | the strongest available model |
| Worker | Reads every skill in a batch in full; writes verdicts and cluster decisions | a long-context model cheap enough to read the whole corpus |
| Verifier | Re-reads the same skills, forms its own view, then checks each worker claim | a different model family from the worker |

Model and provider names belong in the dispatch prompt or `plan.json`, not
in this skill. Run workers and verifiers as separate headless sessions that
write files. Judge the files, never a session's closing message.

## 2. Batching

`scripts/cluster.py` builds the batches. Keep its output unless a pilot
shows a reason to change it.

- **Size.** A batch holds up to 8 skills or about 60,000 tokens of input,
  counting SKILL.md plus every file it references (`input_tokens` in
  `batches.json`), whichever comes first.
- **Similarity.** One batch is one cluster or several small clusters. A
  cluster too large for one batch is split so the most similar members stay
  together, and each part's neighbour file lists the members in the other
  parts with their descriptions.
- **Order.** Every own-skill batch before any modified batch, every
  modified batch before any downloaded batch. Own skills set the standard
  for each category.
- **Depth.** Every skill gets a full read, a category, relations and
  findings. Edits are proposed for own and modified skills. Downloaded
  skills get keep, disable, name-only or fork-into-own, with edits only
  where the operator authorized them.
- **Allowance.** `batches.json` carries one description allowance per batch:
  the smallest allowance among the harnesses its skills ship to. Workers use
  that number and never recompute it.
- **Exact copies** get one verdict under the representative name (see
  `verdict-schema.md` section 2).

## 3. File contract

```
<run-dir>/
  plan.json                     batches, paths, roles, models, doc dates checked
  batches.json                  from cluster.py
  briefs/<batch>.md             the exact worker prompt (filled template)
  briefs/<batch>-neighbours.txt descriptions of out-of-batch neighbours
  briefs/<batch>-verify.md      the exact verifier prompt
  verdicts/<skill>.json         schema in verdict-schema.md
  clusters/<cluster>.json       one per cluster with 2+ members in one batch
  verify/<skill>.json           verifier result
  decisions.md                  orchestrator rulings on disagreements
  report.md                     final report (templates/report.md)
```

Verdicts carry the SHA-256 of every file read. A verdict whose hash no
longer matches the file on disk is stale and is redone.

## 4. Worker brief

Fill `templates/worker-brief.md`. Identical briefs keep verdicts comparable
across batches; the template inlines the steps a worker must not skip (the
full read with hashes, the same-task test, rubric before scores, both-order
comparison) instead of only pointing at the standards.

## 5. Verifier brief

Fill `templates/verifier-brief.md`. The verifier reads each skill and
writes its own short list of problems before opening the worker's verdict,
so it is not anchored by it. Then it marks every worker item confirmed,
rejected or unclear, adds what the worker missed, and computes agreement as
confirmed divided by confirmed plus rejected.

## 6. Orchestrator duties

- **Before dispatch:** re-check harness docs and the spec for changed
  limits (record dates in `plan.json`); run `inventory.py` and `cluster.py`;
  fill briefs; run one pilot batch and read every file it produced. Fix the
  brief, not the verdicts, when the pilot shows a systematic miss.
- **After each batch:** run `check_verdicts.py --plan batches.json
  --clusters`, then compare at least one verdict per batch against the skill
  yourself.
- **After verification:** `check_verdicts.py --require-verify`. Rule on
  every rejected or unclear item that changes an action (merge, retire,
  rewrite, disable) and record the ruling with evidence in `decisions.md`.
- **Usage:** if session history or invocation counts are available, put them
  in a `usage.json` the briefs point to; otherwise merge and retire stay at
  medium confidence at most.
- **Cross-cluster pass:** read all final descriptions together and look for
  collisions that the clusters hid.
- **Report:** assemble from files only.

## 7. Resuming and costs

The files are the state. To resume, rerun `check_verdicts.py`; it lists
skills with no verdict, stale hashes or no verification, and only those are
dispatched again.

Estimate before a large run:

```
standards_tokens x 2 x batches            (each worker and verifier reads the standards)
+ input_tokens summed over batches x 2    (worker read + verifier read)
+ about 3,500 output tokens x skills x 2  (verdicts + verifier results)
+ 20% for reruns
```

Replace the estimates with the pilot's measured tokens, then confirm with
the operator before dispatching the rest when the projected spend matters
to them.
