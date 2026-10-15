# Description standard

The description is the only text a harness shows the model before a skill
loads. It decides whether the skill fires, and it competes for a fixed
listing budget with every other installed skill.

## Contents

1. How the budget works, per harness
2. Computing the allowance
3. Required structure
4. What to cut, what to keep
5. Checks D1 to D10
6. Rewriting a description
7. Trigger tests

## 1. How the budget works

| Harness | Listing budget | On overflow | Controls that remove a skill from the listing |
| --- | --- | --- | --- |
| Claude Code | 1% of the context window; per-skill cap 1,536 chars for `description` + `when_to_use` [S1] | Drops descriptions, least-invoked skills first; names stay [S1] | `skillOverrides` (`name-only`, `user-invocable-only`, `off`) in settings; `disable-model-invocation: true` |
| Codex | 2% of the context window, not configurable [S14] | Reported: truncates all descriptions, then removes all descriptions and drops skills [S14 to S17]; confirm with the startup warning | `[[skills.config]] enabled = false`; `policy.allow_implicit_invocation: false` in `agents/openai.yaml` |
| Gemini CLI, Antigravity | not documented; verify at audit time | not documented | none documented |
| OpenCode | not documented | not documented | `metadata.opencode/autoinvoke: "false"` |
| Pi | not documented | not documented | `disable-model-invocation: true` |
| Hermes | about 3k tokens for the level-0 list [S10] (about 12,000 chars, estimate) | not documented | `requires_toolsets`, `fallback_for_toolsets` |
| Spec | `description` 1 to 1,024 chars [S4] | skill invalid | none |

Budgets change between releases. Before a corpus run, re-check the docs and
the harness's own diagnostic (`/doctor` and `/context` in Claude Code, the
Codex startup warning), and record what was checked.

A skill whose description is dropped can still be called by name but can no
longer be chosen from intent. When everything overflows at once, the whole
collection becomes name-only.

## 2. Computing the allowance

For each harness with a known budget:

```
B        = context tokens x fraction x 4      (4 chars/token: English estimate; CJK text is 1 to 2)
N        = skills the model may invoke in that harness (after every control in section 1)
overhead = 30 chars per listed skill           (name plus formatting; recompute if names average over 20 chars)
target   = 0.8 x B                             (headroom for bundled and plugin skills not inventoried)
allowance = (target - N x overhead) / N
```

`scripts/inventory.py` computes this per harness, counting the controls it
can read. Each batch gets the smallest computed allowance among the
harnesses its skills ship to. Harnesses with no published budget are
recorded as `allowance: unknown`; they do not fail D4, and the report lists
them as a collection-level risk.

**Precedence when the allowance is below about 120 characters.** The
collection cannot be fixed by shortening. D4 is scored `n/a` with the note
"over-budget collection", and the recommendation must reduce N: merge
duplicates, set manual workflows to `disable-model-invocation` or
name-only, or split loadouts into a core set and per-harness packs. Do not
propose a description whose only virtue is meeting an allowance the
collection cannot meet.

## 3. Required structure

```
<What it does, in the shortest clause that names the capability>. Use when <situations
in the user's words, 2 to 4 natural phrases>.
```

- **Both parts in the first 150 characters.** Truncation cuts from the end,
  so the capability noun and at least one phrase a user would type must both
  sit before character 150. Keep the "what" clause short (aim for 60
  characters) so the "when" clause starts early.
- **Third person, present tense.** "Extracts text and tables from PDF files."
  No "I", "you", "your", "this skill helps".
- **User vocabulary.** Name the files, tools and situations a request will
  mention, not the skill's internal method.
- **Distinctive positive terms over denials.** "Handles scanned-image PDFs"
  routes better than "not for PDF forms": a denial adds the very tokens that
  attract the wrong requests. Add "not for X (use Y)" only when the same-task
  test shows a real collision, place it after the positive triggers, and
  record the same boundary in both skills' verdicts.
- **Vary the opening.** Two descriptions in one cluster must not open with
  the same two words.
- **Distinctive names need less.** A skill named for a known product or
  library (`linear`, `gsap-core`) can say what it covers in one clause.
  Generic names (`review`, `utilities`) need explicit situations.

## 4. What to cut, what to keep

Cut:

- Workflow summaries. The body holds the process; a summary in the
  description invites the model to act on the summary without loading the
  skill.
- Quoted trigger lists. Two to four natural phrases inside the "Use when"
  clause route better per character than twenty quoted strings.
- Capitalized commands ("ALWAYS invoke", "CRITICAL"), XML or angle-bracket
  tags.
- Version numbers, URLs, author names, file paths, model or provider names.
- Filler: "comprehensive", "powerful", "seamlessly", "and much more",
  "various tasks", "helps with".
- Anything the name already says.

Keep: the concrete objects a request will mention, and the one or two
situations that separate this skill from its nearest neighbor.

An "even if the user does not say X" clause is allowed only when a probe
(section 7) shows at least 2 misses in 3 runs on should-trigger requests that
omit X. Record the counts in the verdict, use at most one such clause, and
re-probe the near misses afterwards.

## 5. Checks D1 to D10

Each check is pass, fail, or `n/a` with the reason in the verdict.

| ID | Pass when |
| --- | --- |
| D1 | It states what the skill does |
| D2 | It states when to use it in words a user would type |
| D3 | The first 150 characters contain the capability noun and at least one user phrase |
| D4 | It fits the batch allowance and is at most 1,024 chars (`n/a` if the allowance is unknown or below 120) |
| D5 | No mechanism defects: workflow summary, quoted trigger list, capitalized commands, tags |
| D6 | No cruft: filler, URLs, versions, author names, paths, model or provider names |
| D7 | Third person, present tense; no first or second person |
| D8 | No collision: the same-task test is "no" for every neighbor, and no other description shares its lead verb and object noun in the first 150 chars |
| D9 | Not over-broad: a probe fires on fewer than 2 of its near misses (`n/a` if unprobed) |
| D10 | The body does what the description promises, and nothing the description omits is the skill's main job |

## 6. Rewriting a description

1. Read the whole skill. Describe the skill that exists.
2. List the requests that should load it and the near misses that should
   not.
3. Draft to section 3. Fit the allowance; if the allowance is below 120,
   stop and recommend N reduction instead.
4. Check the draft against every description in the cluster and the
   neighbor list; vary lead verbs and objects; fix shared boundaries in both
   skills.
5. Record old text, new text and the reason in the verdict.

## 7. Trigger tests

Write a test set into the verdict when an own or modified skill's
description changes, or when routing between cluster members is in doubt:

- About 10 requests that should trigger it, as users type them, at least
  half without the skill's name.
- About 10 near misses: requests sharing keywords with the skill that need a
  different skill or none. Obviously unrelated requests test nothing.

Running a probe costs about 20 queries x 3 runs per skill. Probe by default
only same-task suspects and rewritten own skills; estimate `skills x 60`
calls and confirm the spend before running. Split 60/40 into tuning and
held-out sets, iterate the description at most 5 times, and choose the
version with the best held-out accuracy [S6]. Claude Code's plugin evals offer a skill-use grader [S1];
elsewhere, score by hand. An unprobed rewrite is reported as unprobed; never
claim it "fires when it should".
