# Body standard

What a well-built skill looks like after it loads, and the defects to look
for. Sections 1 to 3 are checkable by script; sections 4 to 8 need reading.

## Contents

1. Frontmatter conformance
2. Size and shape
3. Repetition and broken resources
4. Structure and modes
5. Instruction quality (smell catalogue)
6. Conflicting instructions
7. Thin skills and command candidates
8. Dependencies, portability, safety
9. Recording findings

## Check IDs

Cite these IDs (or a smell ID from section 5, or a D-check from
`description-standard.md`) in every finding, so results can be counted
across a collection.

| ID | Check | Section |
| --- | --- | --- |
| B-FRONT | Frontmatter conforms | 1 |
| B-SIZE | Size and shape within the table | 2 |
| B-TRIM | Loaded text cut, not only moved | 2 |
| B-REPEAT | No repeated paragraphs | 3 |
| B-REF | Every referenced file exists; no orphans | 3 |
| B-MODES | Distinct ways of working live in per-mode references | 4 |
| B-FLOW | Purpose, path choice, steps, outputs, verification in that order | 4 |
| B-FREEDOM | Prescription matches fragility | 4 |
| B-WHY | Rules carry their reason; no bare capitalized commands | 4 |
| B-TIME | No time-sensitive text | 4 |
| B-THIN | Thin skill: command, fold in, or keep with reason | 7 |
| B-DEPS | Skills it calls are installed alongside | 8 |
| B-PORT | Portability limits recorded | 8 |
| B-SAFE | No safety hazards | 8 |

## 1. Frontmatter conformance

The numbers below were checked against the spec and harness docs on
2026-10-15 (`research-findings.md` F1 to F7). Docs win over this file: in a
corpus run, re-check them before dispatch and record the dates in
`plan.json`.

- `name`: 1 to 64 chars, lowercase letters, digits, single hyphens, no
  leading or trailing hyphen, equal to the directory name. A mismatch makes
  the command name and the routed name differ between harnesses.
- `description`: present, 1 to 1,024 chars, see `description-standard.md`.
- Portable top-level fields: `name`, `description`, `license`,
  `compatibility` (max 500 chars), `metadata`, `allowed-tools`. Claude Code
  frontmatter fields (`when_to_use`, `disable-model-invocation`,
  `user-invocable`, `argument-hint`, `arguments`, `context`, `agent`) are
  allowed when the skill targets that harness. (`user-invocable-only` is a
  `skillOverrides` value in settings, not a frontmatter field.)
- A `model` field pins a model inside the skill. Record it as a B-PORT
  finding and propose removal unless the skill is deliberately
  single-harness personal tooling; model choice belongs in dispatch prompts.
- Anything else at top level (`version`, `tags`, `author`, `grade`,
  `source`, `category`) moves under `metadata` as string values. OpenCode
  and the spec treat `metadata` as a string-to-string map.
- Malformed YAML is silent in some harnesses: the body still loads but the
  description is empty, so the skill can never be chosen from intent.

## 2. Size and shape

| Signal | Threshold | Action |
| --- | --- | --- |
| SKILL.md body | over 500 lines | split into references |
| Body with no `references/` | over 300 lines | candidate monolith; split by mode or topic |
| Body words | over 5,000 | split; most of it is reference material |
| Reference file | over 100 lines | needs a table of contents at the top |
| Reference depth | file that points to another reference | flatten to one level from SKILL.md |
| Inline code | long code blocks the agent could run instead | move into `scripts/` and call it |

Size limits are not quality goals. A 60-line skill that routes and works is
better than a 400-line one. The question is always whether each part earns
the context it costs once loaded.

**Trim, do not only split (B-TRIM).** Splitting moves tokens; only cutting
removes them. Go clause by clause through SKILL.md and every reference its
steps load, and cut what the model already knows (S-OBV), what it cannot act
on (S-NONACT), install and changelog text (S-INSTALL), stale markers
(S-TODO), filler adjectives, and anything stated twice. Record the
before-and-after word count in the verdict `notes`.

## 3. Repetition and broken resources

- **Repeated content.** Any paragraph of 160 or more characters that
  appears twice is a defect. A whole body repeated 3 or 4 times is a
  pipeline bug in whatever generated or synced the file, not an authoring
  choice. Find the last clean version in git history or upstream before
  editing, and fix the generator so it does not recur.
- **Broken disclosure.** Every `references/`, `scripts/`, `assets/` path the
  body mentions must exist. A skill that points at missing files fails at
  the moment it is needed.
- **Orphans.** Files in the skill that nothing references either get a
  pointer from SKILL.md or are removed.
- **Copies.** The same skill in several places with different hashes is a
  system defect; record it for the `system` mode instead of editing one copy.

## 4. Structure and modes

A loaded skill should let the agent decide quickly what to do and where to
read next.

- **Order:** purpose in one or two sentences, then how to choose a path,
  then the steps or rules, then outputs and verification.
- **Modes through references.** When a skill has two or more distinct ways
  of working (create, implement, audit; quick, deep; per platform), SKILL.md
  holds a short table that picks the mode, and each mode's detail lives in
  `references/<mode>.md`. The agent then loads only the mode it needs. One
  router skill with modes replaces several overlapping skills.
- **Degrees of freedom match fragility.** Judgment tasks get goals and
  heuristics. Fragile, order-dependent operations get an exact script or
  command. A rigid command list for a judgment task is a smell; so is free
  prose for a migration that must run in one order.
- **Explain why.** A rule with its reason survives edge cases; a bare
  MUST in capitals does not, and it signals that the author was fighting a
  failure without understanding it.
- **Verification.** Multi-step work ends with a check the agent runs, and
  says what to do when the check fails.
- **No time-sensitive text.** "Before August use X" goes stale. Put the
  current method first and any legacy method in a clearly marked section.
- **Consistent terms.** One name per concept throughout the skill and its
  references.

## 5. Instruction quality (smell catalogue)

From the SKILL.md smell study (research-findings F17) and the 138K-file
defect taxonomy (F18). Use the IDs in verdicts.

| ID | Smell | Look for |
| --- | --- | --- |
| S-TSW | Stepless workflow | a whole procedure as one prose block |
| S-TOB | Option buffet | several tools or methods with no default |
| S-MUS | Missing utility script | repeated deterministic work done by hand each time |
| S-MDT | Missing decision tree | branching situations with no rule for choosing |
| S-SOC | Series of commands | rigid command list where the goal should guide |
| S-NVS | No validation step | output produced once, never checked |
| S-EWP | Execute without plan | complex change with no plan or checkpoint |
| S-NAH | Never asks human | no point where the agent stops for a decision that is the user's |
| S-RL | Rationalization loophole | required steps the agent can talk itself out of skipping |
| S-NPT | No progress tracking | long multi-step work with no checklist or state |
| S-UD | Undelegated detail | low-level detail inline that belongs in references or scripts |
| S-NG | No guardrails | nothing stops an impossible or harmful attempt |
| S-BG | Buried gotchas | critical warnings hidden mid-paragraph |
| S-MUR | Missing usage rules | no statement of when not to use it |
| S-ME | Missing example | no concrete input-output example where one would help |
| S-TSS | Time-sensitive | dates and "currently" claims that will rot |
| S-NONACT | Non-actionable body | background prose the agent cannot act on |
| S-OBV | Explains the obvious | teaches the model what it already knows |
| S-PERSONA | Persona redefinition | "you are a..." overriding the agent's role |
| S-OVERRIDE | Instruction override | tells the agent to ignore prior or system instructions |
| S-SCOPE | Scope mismatch | body does more or less than the description claims |
| S-INSTALL | Install boilerplate | setup, changelog or license text inside SKILL.md |
| S-TODO | Unfinished markers | TODO, FIXME, unchecked project checklists |

Not every absence is a defect. A small single-purpose skill does not need a
decision tree or progress tracking. Record an absence smell only when the
work the skill describes would fail or drift without it.

## 6. Conflicting instructions

Three kinds, each recorded with both quotes:

- **Internal.** Two statements in the same skill that cannot both be obeyed
  ("never ask the user" and "confirm each step with the user").
- **Against the operator's standing rules.** A skill that contradicts the
  global instruction files it will run under (for example, the operator's
  rules on when to ask, on publishing, on style). The global file wins at
  runtime, so the skill instruction is dead weight or, worse, a source of
  inconsistent behavior. Read the operator's global instruction files for
  the target harnesses before judging this.
- **Across skills.** Two skills that fire on the same request and prescribe
  opposite behavior. Record it in the cluster decision.

## 7. Thin skills and command candidates

A skill under about 150 words with no process, no resources and no decision
logic is usually a saved prompt. Ask:

- Would a user invoke it by name rather than have it chosen from intent?
  Then it is a command (or `disable-model-invocation: true`), and it stops
  costing listing budget.
- Is it a fragment of a larger skill? Fold it in as a mode or reference.
- Is it dense and excellent despite its size? Keep it. Short is not a
  defect; empty is.

Signals of an auto-saved session skill: written as a transcript of one
session, tied to one project or one cron job, referencing tools that do not
exist in the target harness, several near-identical siblings from the same
period, no reason a second user would want it.

## 8. Dependencies, portability, safety

- **Skill dependencies.** If the body tells the agent to use another skill,
  that skill must be installed wherever this one is. Record missing ones.
- **Portability.** Hardcoded model or provider names, absolute user paths,
  OS-only commands and harness-only tool names limit where the skill works.
  Fine for a personal skill pinned to one machine; record them so the
  operator can decide.
- **Safety.** Hardcoded credentials, piping downloads into a shell,
  disabling verification flags, unguarded deletion, error suppression.
  Report these first in any verdict regardless of other quality.

## 9. Recording findings

Each finding in the verdict carries exactly one ID (a B-check from the
table at the top, a smell ID from section 5, or a D-check from
`description-standard.md`), a severity (`blocker`, `major`, `minor`), the
quoted line with its line number, and the proposed fix as a concrete edit
(old text, new text) or a concrete move ("lines 80 to 210 to
references/api.md").

Edits may add as well as replace: a missing decision rule, example,
validation step or mode file is proposed as new text or a new file. When the
skill's job needs something that is absent, that absence is a finding, not
optional polish.
