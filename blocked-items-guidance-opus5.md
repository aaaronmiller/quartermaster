I read the brief. Everything below is guidance derived from the brief's own facts plus what is already recorded in the global contract. I ran no commands, so every CLI verb I name is **unverified**: confirm with `--help` before running. Findings marked **inferred** follow from the brief's numbers; findings marked **evidence** cite something already on record.

---

# Blocked Items Report

## Root causes first

Ten listed items do not have ten causes. They have five.

| Root cause | Items |
|---|---|
| R1. Quartermaster rollout gate (safety, collisions, verdict coverage) | A1, A2, A3, B6-harness-overwrites |
| R2. Missing account access / canary authorization | B2 (CP-002, AOS-D004, CP-006), B6-deployment |
| R3. Source-trust policy never written | A4-B4, B6-Skillshare |
| R4. Mislabeled: not blocked, never started | B2-CG-T043, B4 |
| R5. Pure work, no decision needed | B5, A4-B5, B6-model-pins, most of B3 |

Only R2 and one part of R1 need the human. The rest needs hours, not answers.

---

# A. Quartermaster

## A1. Twelve skills below the 0.60 safety threshold

**Recommended action: investigate before remediating. Do not batch-override.**

The decisive signal is in the number itself. Twelve unrelated artifacts scoring **exactly 0.40** is not twelve independent content judgements. It is one rule, or one small set of rules, firing identically on all twelve (**inferred**). A content-derived risk score over artifacts as different as `s3-file-operations` and `testing-patterns` would scatter. A flat 0.40 means the scorer is measuring a shared property, most likely missing metadata or provenance, not per-artifact danger.

That changes the answer. If the gate is measuring provenance, override is the wrong instrument for all twelve, because it records twelve permanent exceptions for one fixable defect.

Triage the twelve into three buckets and treat each bucket once:

- **Bucket 1, real capability reach (5):** `s3-file-operations`, `setup-gbrain`, `mcp-integration`, `codex`, `benchmark-models`. These touch credentials, remote storage, or external model endpoints. Even if the 0.40 is a metadata artifact, these deserve a real read before deployment.
- **Bucket 2, one family, one decision (4):** `github-code-review`, `github-issues`, `github-pr-workflow`, `github-repo-management`. Same author, same pattern, same `gh` CLI surface. If one is acceptable, all four are. One override note covers the set.
- **Bucket 3, local and read-only (3):** `intent-archaeology`, `last30days`, `testing-patterns`. These read local history and write local reports. A 0.40 here is almost certainly a false positive from the shared rule. **Remediate, do not override.**

**Exact next step**

```
qm safety --help
qm safety explain benchmark-models
qm audit --matrix --json | head -c 4000
```

Take the first verb that exists. Read the reason breakdown for one Bucket 3 skill (`testing-patterns`) and one Bucket 1 skill (`s3-file-operations`). If the two share the same failing checks, the gate is measuring provenance and the fix is metadata. If they differ, the score is real and each bucket needs its own call.

**Risks**

- Blanket override hides a scorer calibration bug and creates twelve exceptions nobody revisits. Override debt is invisible debt.
- Lowering the threshold to 0.35 admits everything at 0.40 including any genuine finding. It defeats the gate rather than passing it. That is weakening a failed gate to obtain a pass.
- Remediating third-party artifacts (`codex`, `mcp-integration`, gstack-sourced skills) creates upstream drift. The next vendor sync reverts your fix and the gate re-fires. For third-party artifacts, override with a note is the durable choice; for first-party, remediation is.

**Human input required**

One policy question, answerable in a sentence: **is the safety gate a provenance gate or a capability gate?** Provenance means remediate the metadata. Capability means review and override with a recorded note. The twelve-way tie says provenance, so my recommendation is: remediate Bucket 3, review-then-override Buckets 1 and 2 with per-bucket notes naming the credential surface.

**Blocked on:** roughly 30 minutes of read-only investigation, then one small decision.

---

## A2. Four flatten collisions (eight rows)

**Recommended action: first-party wins the bare name; prefix the third-party copy. Do not scope, do not ask per skill.**

Four names collide, each twice: `cso`, `office-hours`, `plan-ceo-review`, `plan-eng-review`.

**Evidence that settles this without a decision:** the live harness already resolved exactly this collision, exactly this way. The active skill catalog on this machine carries both `cso` and `gstack-cso`, both `office-hours` and `gstack-office-hours`, both `plan-ceo-review` and `gstack-plan-ceo-review`, both `plan-eng-review` and `gstack-plan-eng-review`. The bare name belongs to the curated copy; the gstack copy carries its source prefix. Quartermaster should reproduce the convention already in use, not invent a competing one.

The general rule to encode: on flatten collision, precedence is `first-party > third-party`, and the loser is renamed `<source>-<name>`, not skipped. A rename is a recorded operation with a reason. A skip is a silent gap, and a skip here means four skills the user has on disk never arrive at the target.

**Exact next step**

```
diff -r <third-party/gstack/cso> <first-party/agents-curated/cso>
```

Run it for all four pairs first. Then branch:

- **Byte-identical:** deduplicate. Drop the third-party row, emit one op, no rename, no ambiguity.
- **Divergent:** apply the prefix rule. Emit two ops: `cso` from curated, `gstack-cso` from gstack.

Then change the flattener from report-and-skip to report-and-rename, and re-run the dry run. Acceptance gate: exclusions drop from 20 to 12 (the A1 skills only), and four rename operations appear with a stated reason.

**Risks**

- Renaming changes the invocation name. Any prompt, doc, or script that calls `/cso` and expects the gstack behaviour now gets the curated behaviour. The `diff` step exists to size that risk before you take it. If the two copies are identical, the risk is zero.
- Precedence encoded per skill instead of per tier does not survive the next collision. Encode the tier rule.

**Human input required**

Confirm two things, both with a recommended default: first-party precedence (**recommend yes**), and the prefix format `gstack-<name>` (**recommend yes, it matches disk**). If the diff comes back identical, neither question matters and you can proceed without asking.

**Blocked on:** work. About an hour, including the diff.

---

## A3. Non-skill artifacts absent from every plan and every exclusion list

**This is the most important item in the report. Recommended action: prove verdict coverage first, then convert the silence into a recorded deferral. Do not expand the deploy scope to fix it.**

Split the 12,134 rows, because they are not one problem:

- **10,487 script-type rows, believed package members.** These should *never* appear as top-level plan operations. A file inside a skill directory is carried by its parent. Their absence from the ops list is correct. Their absence from any verdict is not. The right verdict is `carried-by-parent <id>`, and NFR-050 is satisfied by stating it.
- **189 genuine top-level non-skill artifacts** (103 plugins, 80 output-styles, 4 hooks, 1 agent, 1 mcp-config). These have real harness targets: plugin directories, output-style directories, `settings.json` hook blocks, agent files, `.mcp.json`. Their absence from both operations *and* exclusions is the real defect.

So the answer to "is it a silent drop or legitimate gating?" is: **almost certainly both, mixed together, and the mixing is itself the NFR-050 violation** (**inferred**). Legitimate gating that emits no reason is indistinguishable from a bug. NFR-050 exists precisely to make those two states distinguishable.

**Where in the compiler.** Look for a `kind == 'skill'` filter applied to the candidate set *before* the exclusion recorder runs. That is the classic shape: filter-then-explain. Everything removed by the filter is invisible to the explainer, so it can never produce a reason. The structural fix is to invert the loop: iterate every catalog row, assign exactly one verdict to each, emit operations for `include` and a reason for every other verdict. Then NFR-050 is true by construction rather than by test.

**Exact next step**

```
qm audit --matrix --json > /tmp/qm-matrix.json
```

Then answer one question: **how many of the 12,134 rows carry a verdict?** Group by `kind` and `verdict`. Three verdict classes are legitimate and should exist: `carried-by-parent`, `kind-unsupported-by-harness` (an output-style has no codex target), `profile-not-selected`. Any row with no verdict at all is the violation, and its count is your defect size.

**The unblocking move.** If non-skill kinds are out of scope for this rollout, do not implement non-skill deployment. Emit an explicit verdict instead: `kind deferred by rollout policy QM-<n>`. That satisfies NFR-050 in a day, keeps the deploy at 2,328 skill operations, and leaves the expansion for later. Boring and fully reversible.

**Risks**

- Fixing this by *deploying* the non-skill kinds silently expands blast radius from "write files into a skills directory" to "mutate `settings.json` hooks and `.mcp.json`". That is a jump from Green to Yellow-or-Red, and it would ride in on a change that looks like a reporting fix. Keep the reporting fix and the scope expansion as two separate changes, in that order.
- Verdict emission is a schema change, which collides with A4-B5 (QM-004 Phase B normative schemas). Make the verdict field additive so Phase B can normalize it later rather than blocking on it now.

**Human input required**

One decision: **are non-skill kinds in scope for this rollout, or deferred?** **Recommend deferred**, with the deferral recorded as an explicit exclusion reason. That unblocks the rollout this week without touching harness settings files.

**Blocked on:** a 15-minute read-only check, then a day of compiler work, then one scope decision.

---

## A4. Portfolio-registry: source-policy approval (B4) and QM-004 Phase B (B5)

**Recommended action: sequence both after the rollout. Neither blocks it. Convert B4 from an open question into a proposal with a default.**

**On B4.** "Needs a decision (no proposal exists)" means it is not blocked on the human, it is blocked on nobody having written the page. Presenting an open question is the wrong move; the standing contract requires proposing the best available answer so the human answers yes or no. Write the proposal with this default:

> Expanded sources remain **inactive and untrusted** until each source has a named owner, a provenance check, and an assigned trust tier. Trusted = first-party plus explicitly vetted third-party. Everything else is catalogued and auditable but not deployable.

That default lets the catalog keep growing while the deployable set stays narrow, which is exactly the posture the rollout needs.

**On B5 (QM-004 Phase B).** Normative schemas, negative fixtures, deterministic migration. Blocked on work, correctly labelled. It does not block the rollout. It *does* interact with A3: if A3 adds a verdict field and Phase B later normalizes the schema, you touch it twice. Accept that. A3 is small and additive; blocking a rollout-critical fix behind a schema programme inverts the priority.

**Sequencing:** A3 verdict reporting → A2 collision policy → A1 triage → rollout ships → B4 proposal written and approved → QM-004 Phase B, which then normalizes the verdict schema A3 introduced.

**Exact next step**

Write one dossier page: `source-policy-proposal`, containing the default above, the list of expanded sources, and a `## Questions for the user` packet with the recommended option marked. Follow the exact question-packet format in the Living Documents schema or the reader renders it as inert prose.

**Risks**

- Doing B4 before the rollout stalls the rollout on a decision it does not need.
- Doing Phase B before A3 stalls an NFR-050 violation fix behind a schema programme.
- The proposal page silently failing to render as a form. Validate with `python3 skill/scripts/check-schema-tight-loop --all` before presenting it.

**Human input required**

Only after the proposal exists: approve or amend the trust-tier default. Not now.

**Blocked on:** B4 on work (one page). B5 on work (a programme). Neither on a decision today.

---

`★ Insight ─────────────────────────────────────`
A1 and A3 are the same class of bug wearing different clothes. Both are **filter-then-explain**: something removes candidates from a set before the component responsible for producing reasons ever sees them. In A1 the filter is a threshold and the removed items at least get a number; in A3 the filter is a kind check and the removed items get nothing. The durable fix in both cases is to make the explainer see every candidate and assign every one a verdict, so "no reason" becomes structurally impossible rather than a test you can forget to run.
`─────────────────────────────────────────────────`

---

# B. Other projects

## B1. AAA Voice Assistant, repository reconciliation gate

**Recommended action: capture read-only state on both machines and push backup branches before touching anything. Then, and only then, ask the authority question.**

Cross-machine reconciliation is where irreversible loss actually happens, and it happens during the cleanup, not during the divergence. The reversible move is to make every machine's current state recoverable from the remote *first*. After that, any merge, rebase, or reset is undoable.

**Exact next step**, on each machine, read-only:

```
git -C <repo> remote -v
git -C <repo> status --porcelain=v1
git -C <repo> log --oneline -20
git -C <repo> rev-list --left-right --count @{u}...HEAD
git -C <repo> stash list
```

Paste both captures into `repository-reconciliation-gate.md` as evidence. Then, before any merge:

```
git -C <repo> push origin HEAD:refs/heads/backup/<machine>-2026-08-20
```

Decide authority **per branch**, not per repository. Most cross-machine divergence is one machine ahead on one branch and behind on another, and a whole-repo verdict throws away the half that was fine.

**Risks**

- Force-push or `reset --hard` destroying the only copy of work. The backup branches eliminate this.
- Untracked-but-required files. The git publication invariant applies: the reconciliation is complete only when the result reproduces from a clean checkout. A "reconciled" repo missing an untracked config is not reconciled. Check `status --porcelain` for untracked files that the setup actually needs before declaring done.
- Stashes are not pushed by the backup branch. Capture `stash list` separately and materialize anything valuable into a commit.

**Human input required, and it is genuinely required.** Which machine is authoritative, per diverging branch, and whether the other machine's divergence is work to keep or scratch to discard. This cannot be inferred from git state: both sides look like real commits. Ask once, with the two captures attached so the answer is cheap.

**Blocked on:** a decision, but the capture and backup work should happen before you ask.

---

## B2. Claude Code Proxy / Agentic OS

**Recommended action: collapse three of the four into one authorization packet, and verify the proxy is actually running before requesting canary authorization.**

CP-002 → AOS-D004 → account access is a single chain with a single root. Only the root matters. CG-T043 is not blocked at all; see B4 below.

**Evidence that reorders this item:** as of 2026-08-20, claude-code-proxy was not running and nothing was listening on 8082 or 8787. CP-006 is a canary *through the proxy*. Requesting authorization for a canary you cannot execute wastes the human's decision and produces an approval that expires before use. Check the listener first.

**Exact next step**

```
ss -ltnp | grep -E '8082|8787'
```

If nothing is listening, the top task is standing the proxy up, not obtaining authorization. If it is listening, present a one-page authorization form with all five parameters **pre-filled with recommended defaults**, so the human approves rather than composes:

- **Profile:** one named non-production profile, single harness, lowest-risk workload.
- **Budget:** hard cap, 200 requests or $5, whichever comes first. Abort at the cap, do not degrade.
- **Privacy:** no prompt or completion bodies leave the machine. Log metadata only: model, token counts, latency, status code.
- **Error threshold:** abort at 2% error rate or 3 consecutive failures, whichever comes first.
- **Rollback:** unset `ANTHROPIC_BASE_URL`, restart the harness. Time-box the canary to 60 minutes with an automatic stop.

**On AOS-D004 specifically, propose the workaround rather than waiting.** Quota facts do not strictly require account access. The two opencode limits are already characterized empirically on record: `401 CreditsError` for exhausted balance on paid models, and `429 FreeUsageLimitError` (errorId 659456) as a real request-rate cap on free models, observed after two successful calls on `opencode-zen/deepseek-v4-flash-free`. An empirical quota table built from observed responses is achievable today and converts a hard block into ordinary work. It is less precise than account data and should be labelled as observed rather than authoritative.

**Risks**

- A canary with no automatic stop becomes a permanent config change by inertia. The time-box is not optional.
- Routing through a proxy moves prompt content to a third party. The privacy parameter is the one that must not be defaulted quietly; state it explicitly in the packet even though I have proposed a value.
- An empirical quota table gets cited later as authoritative. Label it at the source, not in a footnote.

**Human input required:** approval of the five-parameter packet, one signature. Plus the account-access question, which the empirical workaround makes non-blocking.

**Blocked on:** R2, authorization. Genuinely a decision, once the proxy is up.

---

## B3. Portfolio / ARDF, 2026-08-20

Four separate problems. The ordering matters more than the individual fixes.

**Recommended action: protect the 26 uncommitted files today. Everything else can wait a week.**

745 insertions across 26 files with no commit is unbacked work. It is the only item in this entire report where delay carries a real chance of permanent loss. Fix it first and it takes ten minutes.

**Exact next step**

```
git -C /home/cheta/code/ardf status --porcelain
```

Read the file list before staging anything. Then:

```
git -C /home/cheta/code/ardf checkout -b wip/2026-08-20-uncommitted
git -C /home/cheta/code/ardf add -A
git -C /home/cheta/code/ardf commit -m "wip: snapshot uncommitted portfolio work"
```

**One caveat that changes the commands:** it is on record that ARDF had **zero git commits** as of 2026-08-20. If that still holds there is no branch to branch from. In that case make the initial commit on `main`, then create the working branch immediately after. Verify with `git -C /home/cheta/code/ardf log --oneline -1` before choosing.

**The functional bug is separate and more valuable.** `ardf_roles.py` and `model_roles_api.py` are not wired into the gold-standard path, and that path currently resolves **zero slots**. Zero slots is not staleness, it is a broken resolver. The 93-day-stale gold standard is a symptom people are looking at because it has a number; the zero-slot resolution is the actual failure. Wire the two modules and re-run the resolver before doing anything about staleness. This is work, not a decision.

**Risks**

- `git add -A` on an unreviewed working tree can commit provider API keys, caches, or large generated artifacts. ARDF holds provider registry data, and there is a 19M `dashboard.html` in the neighbourhood. Inspect the file list and write `.gitignore` before staging. This is the one step not to automate.
- Refreshing the gold standard before fixing the resolver produces fresh data that still resolves zero slots, and burns scoring cost for nothing.
- Adding zenmux (221 unscored models) is a real scoring cost against quota. It is a scope decision, not a bug fix.
- Any model-selection figure cited from ARDF today is unverified. Downstream orchestration decisions that cite ARDF cost or capability numbers should say so until ARDF is refreshed and committed.

**Human input required**

Two questions, both of which change the work:

1. **Is the gold standard meant to be frozen or rolling?** If frozen, 93 days stale is correct and irrelevant, and only the zero-slot resolver matters. If rolling, staleness is a real defect and needs a refresh cadence. This single answer removes or adds a whole work item.
2. **Is zenmux in scope?** 221 unscored models is a measurable cost. Recommend deferring until the resolver works, because scoring models a broken resolver cannot surface has no payoff.

**Blocked on:** work, plus two cheap scope questions.

---

## B4. Guardian, CG-T043 runtime promotion gate

**Recommended action: relabel it. "Never started" is not blocked.**

This is the same task listed inside B2, so treat B2-CG-T043 and B4 as one item and count it once.

The label is the problem. A task marked `blocked` is understood as waiting on something external, so nobody picks it up and nobody asks what it is waiting for. A task marked `not-started` is understood as available. CG-T043 has no stated dependency, no blocking party, and no gate it is waiting on. It is unstarted work wearing a blocked label, and the mislabel is what has kept it at zero for as long as it has been listed. Fixing the label costs nothing and is the highest-leverage action available on this item.

**Exact next step**

Change `status: blocked` to `status: not-started` on the CG-T043 page and record why the change was made. Then write the work package as one page with four sections:

1. **Definition:** what "promotion" means concretely, candidate to runtime, and which objects can be promoted.
2. **Criteria:** what a candidate must satisfy to be promoted.
3. **Gate:** the mechanical check that enforces the criteria, and where it runs.
4. **Rollback:** how a promotion is undone, and who can do it.

**Risks**

- A promotion gate specified after promotions are already happening is decorative. It documents current behaviour instead of constraining it. If promotions are already occurring, the gate must start by refusing something.
- If Guardian promotes runtime configuration, the gate touches a Yellow surface. Design the rollback path before the promotion path.

**Human input required**

The promotion criteria, and only if there is a preference. Otherwise use this default: promote when the candidate passes its named acceptance gate twice consecutively and has a recorded, tested rollback. That is boring and reversible, and it can be tightened once it is running.

**Blocked on:** nothing. It is work, and it has been available the whole time.

---

## B5. Model-scan, AO-002 mapping to the Gateway adapter

**Recommended action: do not wait for CP-001. Build against a provisional fixture and swap on landing.**

The mapping work and the fixture authority are separable concerns that got welded together by the dependency link. AO-002 needs *a* fixture to code against; it does not need CP-001's *authoritative* fixture until acceptance. Waiting serializes two things that can run in parallel, and CP-001's fixture gate has no stated completion date.

**Exact next step**

1. Read CP-001's fixture gate acceptance condition, so the provisional fixture is shaped to be replaceable rather than rewritten.
2. Author the minimum fixture that exercises AO-002's mapping: one request/response pair per mapped field, no more.
3. Mark it `provisional: true` in the fixture itself, not in a comment.
4. Add the replacement as an explicit task recording the CP-001 dependency.
5. Make the test suite **fail loudly** if the provisional marker still exists after CP-001 lands.

Step 5 is the one that matters. Without it this pattern is how provisional fixtures become the permanent de facto specification.

**Risks**

- Provisional fixtures encode your assumption about the mapping. If CP-001 lands a different shape, the mapping code needs rework, not just the fixture. Keep the mapping logic thin and fixture-driven so the rework stays in one place.
- A provisional artifact with no expiry outlives the thing it was standing in for. The failing test is the expiry.

**Human input required: none.** This is pure work, unblocked today. Say so on the dossier page and remove the blocked label, same as B4.

**Blocked on:** nothing.

---

## B6. AI Gateway

**Recommended action: unbundle. B6 has no independent root cause. All four parts belong to other items.**

Four different things are sharing one blocked label, which is why it reads as immovable. Split them and three become someone else's problem, already scheduled:

| Part | Real owner | Status |
|---|---|---|
| Harness overwrites | R1, the Quartermaster rollout | Do not do these by hand |
| Deployment | R2, the B2 authorization packet | Covered by one signature |
| Skillshare changes | R3, the A4 source-trust policy | Covered by one proposal |
| Model pins | R5, plain work | Unblocked today |

**On harness overwrites, the important one.** Overwriting harness configuration by hand is exactly the operation Quartermaster exists to perform safely, with a compiled plan, recorded exclusions, journaling, and rollback. Doing it manually while a tool that does it safely sits two fixes from ready is the wrong trade. Route these through `qm deploy` once A1 to A3 land. This collapses the most dangerous part of B6 into the A-rollout at no extra cost.

**On model pins, which you can do this afternoon.** There is a known and specific trap here, already on record: `--model`, `--smol`, `--slow`, and `--plan` override `modelRoles` **only**. They do not touch `retry.fallbackChains`. A pin applied through those flags looks correct and then silently cascades to whatever the fallback chain lists the moment the primary rate-limits. Pinning properly requires `--config <overlay.yml>` covering the chain as well.

**Exact next step**

```
omp --help | grep -A2 -E 'config|model'
```

Then author the overlay file pinning both `modelRoles` and `retry.fallbackChains`, and verify the pin by forcing a primary failure and confirming the request does not cascade. A pin that has not been tested under rate-limit is not a pin.

**Risks**

- The flag-only pin. It is the default thing to reach for, it appears to work, and it fails exactly when you are least watching, under rate-limit. Test the failure path.
- Hand-editing harness config while `qm deploy` also manages those targets produces drift that the next deploy either reverts or refuses. Pick one writer per target.

**Human input required:** none for model pins. The other three parts inherit their questions from A1 to A3, B2, and A4 respectively. B6 should be closed as an item and its parts tracked under those.

---

`★ Insight ─────────────────────────────────────`
Three of the ten items (B4, B5, and most of B6) were not blocked on anything. They were mislabeled, bundled, or waiting on a dependency they only needed at acceptance time rather than at build time. That is a 30% false-blocked rate, and it matches the pattern already measured on this machine: 14 of 19 apparent blockers were already answered somewhere in the record. The cheap habit that catches this is auditing the *label* before auditing the work, because a wrong label costs nothing to fix and immediately returns the task to the available pool.
`─────────────────────────────────────────────────`

---

# Prioritized action list

## Tier 0, today, read-only or protective

1. **B3** Inspect and commit the 26 uncommitted ARDF files to a branch. Only item where delay risks permanent loss. Check `log --oneline -1` first for the zero-commit case, and read the file list before staging. ~15 min.
2. **A3** Run `qm audit --matrix --json`. Count rows carrying a verdict against 12,134. This one number decides whether the rollout has a real NFR-050 violation or an accounting gap. ~15 min.
3. **A1** Run the safety explain verb on `testing-patterns` and `s3-file-operations`. Same failing checks means provenance gate, different means capability gate. Decides the whole A1 approach. ~15 min.
4. **B2** `ss -ltnp | grep -E '8082|8787'`. If the proxy is down, do not request canary authorization yet. ~1 min.
5. **B4, B5** Relabel CG-T043 and AO-002 from blocked to not-started. Zero cost, returns two items to the available pool. ~10 min.

## Tier 1, this week, unblocks the rollout

6. **A2** Diff the four duplicate skill pairs. Dedupe if identical, otherwise apply the `gstack-<name>` prefix rule. Change the flattener from report-and-skip to report-and-rename.
7. **A3** Emit a verdict for every catalog row. Record deferred kinds as an explicit reason. Keep the field additive for QM-004 Phase B. Do **not** expand deploy scope to non-skill kinds in this change.
8. **A1** Apply the bucket triage: remediate Bucket 3, review then override Buckets 1 and 2 with per-bucket notes.
9. **Gate:** re-run the dry run. Acceptance is zero unexplained exclusions and a verdict for all 12,134 rows. Do not relax this to obtain a pass.
10. **Deploy one harness first.** Take opencode: 1,709 operations, the smallest plan and the smallest blast radius. Verify, then claude-code, codex, antigravity.
11. **B6** Harness overwrites now route through `qm deploy`. Close B6 as an item.

## Tier 2, parallel, no dependencies

12. **B6** Author the `omp` overlay pinning both `modelRoles` and `retry.fallbackChains`. Verify under a forced primary failure.
13. **B5** Provisional fixture plus AO-002 mapping, with the loud failing test on the provisional marker.
14. **B3** Wire `ardf_roles.py` and `model_roles_api.py`. Fix zero-slot resolution before touching staleness.
15. **B4** Write the CG-T043 work package: definition, criteria, gate, rollback.

## Tier 3, needs the human

16. **B2** Present the five-parameter canary authorization packet with defaults pre-filled. Only after the proxy is confirmed up.
17. **B1** Present both machine captures plus the pushed backup branches, then ask for per-branch authority.
18. **A4, B4** Write the source-policy proposal with the inactive-and-untrusted default. Validate it renders as a form before presenting.
19. **B3** Ask: gold standard frozen or rolling, and is zenmux in scope.

## Tier 4, after the rollout

20. **A4, B5** QM-004 Phase B: normative schemas, negative fixtures, deterministic migration. This is where the A3 verdict field gets normalized.

---

# Decisions the human must make

Everything else on this list is work.

| # | Decision | Recommendation |
|---|---|---|
| D1 | Safety gate: provenance or capability? (A1) | Provenance. The twelve-way tie at 0.40 says so. Remediate Bucket 3, override Buckets 1 and 2. |
| D2 | Skill precedence and prefix format (A2) | First-party wins the bare name; loser becomes `gstack-<name>`. Matches disk. Moot if the diffs are identical. |
| D3 | Non-skill kinds in scope now, or deferred? (A3) | Deferred, with the deferral recorded as an explicit reason. Unblocks the rollout without touching settings files. |
| D4 | Canary authorization, five parameters (B2, B6) | Defaults proposed above. Privacy is the one to read rather than rubber-stamp. |
| D5 | Cross-machine authority, per branch (B1) | Cannot be inferred. Ask after the captures and backup branches exist. |
| D6 | Gold standard frozen or rolling? (B3) | Answer removes or adds a whole work item. |
| D7 | Zenmux in scope? (B3) | Defer. Scoring 221 models a broken resolver cannot surface has no payoff. |

**Caveats.** No commands were run for this report. All CLI verbs (`qm safety explain`, `qm audit --matrix --json`, flag spellings) are unverified against the installed binary; confirm with `--help`. The claim that all twelve A1 skills score exactly 0.40 is taken from the brief's phrasing; if the scores merely fall below 0.60 and vary, the shared-rule inference weakens and A1 becomes twelve independent reviews rather than three buckets. Check that first, because it is the single assumption most capable of reversing the A1 guidance.
