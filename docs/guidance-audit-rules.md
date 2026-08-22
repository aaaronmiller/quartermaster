# Guidance audit rules

Rules for auditing a guidance file — `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`,
`.kilocoderules` and their siblings. Quartermaster already owns these files
under FR-120..122, which confine managed additions to a delimited section and
preserve hand-written content. This document supplies the criteria that a
guidance audit applies to the hand-written part.

These are **meta-rules**: rules about how a rule must be written, not rules
about what an agent should do. Every one below was derived from a measured
failure in a live guidance file, and each names that evidence.

---

## MR-1 — State each rule exactly once

A rule restated in a second section will drift from the first, and the two
statements will eventually disagree. When they disagree, the reader obeys
whichever it encountered first.

**Audit test.** For each behavioural rule, count the sections that state it.
More than one is a finding. The fix is to keep one statement and replace the
others with a cross-reference.

**Evidence.** `/home/cheta/code/agents/CLAUDE.md`, 2026-08-21:

    line 281   **One blocking decision per terminal reply.**
    line 429   A terminal reply contains at most one blocking decision.

Line 429 sets a ceiling. Line 281 reads as a quota. Measured over the 32
terminal replies of session `9ac1384d`, **28 percent ended in a decision menu**,
including several where the operator had already stated the decision. The same
file states the ask-versus-act rule in three sections and the evidence rule in
thirteen.

## MR-2 — Write ceilings as ceilings

A bare cardinal reads as a target. "One blocking decision per reply" is
received as an instruction to produce one. Only "at most", "up to", or "no
more than" reliably transmits a maximum, and the zero case has to be named
explicitly or it is not believed.

**Audit test.** Grep for a cardinal adjacent to a countable output noun
(decision, question, line, option, item) without a bounding word. Each hit is
a finding.

**Correct form:** *At most one blocking decision, and zero is the normal case.*

## MR-3 — A rule that says HOW must name WHEN

Presentation rules describe the shape of an output. Left as bare imperatives
they acquire the power to *create* the output they were meant only to format.

**Audit test.** Classify every rule as **whether** (do I do this at all),
**how** (what shape does it take), or **what** (which facts). Every *how* rule
must open with an explicit trigger clause. A *how* rule with no trigger is a
finding.

**Evidence.** "Every question must be self-contained, with concrete options and
a named default" is a formatting rule for questions. Read as an unconditional
imperative it manufactures questions to format. Correct form: *When a blocking
decision exists, format it thus.*

## MR-4 — Exactly one rule owns each decision

When the same decision is governed from several sections, the reader
reassembles the procedure from fragments and reassembles it differently each
time. Under pressure it reassembles it wrongly.

**Audit test.** For each decision the file governs, list the sections that
constrain it. More than one owner is a finding. Supporting sections may
elaborate, but must defer to the owner by name.

**Evidence.** An agent auditing this same file on 2026-08-21 reported four
rules in conflict over ask-versus-act. Three of the four readings were wrong:
the Yellow risk class says "inspect; checkpoint; **execute** narrowly" and
never says ask; the change-set rule carries an explicit else-branch
("otherwise announce, apply, and report"); and the blocking-decision rule is a
ceiling. The rules did not actually conflict. They were scattered across four
sections with no owner, so the procedure was reconstructed incorrectly. **A
scattered rule set does not need to be contradictory to be misread.**

## MR-5 — No rule may immunise itself against revision

A section that instructs the reader to preserve it will outlive the policy it
depends on, and no later revision will remove it.

**Audit test.** Grep for self-preservation language: "preserve if", "do not
remove", "keep this section". Each is a finding. Durability belongs to version
control, not to the text.

**Evidence.** `CLAUDE.md` line 630 is headed *"UPAGENT VALIDATION (appended
2026-08-16 — preserve if this section regenerates)"*. It names
`deepseek-v4-flash` as the capability floor and "agy opus-4.6" as the primary
preference. The MODEL ORCHESTRATION section, rewritten four days later on
2026-08-20, **demotes** `deepseek-v4-flash` as the sole 2x-usage executor with
no capability edge, and its model table contains no `opus-4.6`. The preserve
clause is why the contradiction survived the rewrite.

## MR-6 — Supersession must be explicit and dated

Two sections written at different times about the same subject are a silent
contradiction unless one names the other.

**Audit test.** Any two sections covering one subject must carry dates, and the
later must state what it supersedes. MODEL ORCHESTRATION does this correctly:
*"rewritten 2026-08-20; supersedes the 2026-08-12 version"*. UPAGENT
VALIDATION does not, which is how MR-5's contradiction went unnoticed.

## MR-7 — A guidance file has a compliance budget

Rules compete with each other for a finite amount of attention. Past some size
each added rule reduces compliance with the rules already present. A file that
only grows will eventually enforce nothing, and the rules added last in
response to the most recent failure displace the ones that were working.

**Audit test.** Track total lines and section count over time. Any growth
without a corresponding retirement is a finding. Require that adding a section
either retires one or states why none can be.

**Evidence.** `CLAUDE.md` is 664 lines and 35,371 characters across 22
sections; six of those sections were added within two days. The REPORTING
section it added says *"Every reply opens with a three-line status block. **No
exceptions.**"* Measured across the 32 terminal replies of the session that
wrote it:

| metric | rule | measured |
| --- | --- | --- |
| opens with the status block | 100% required | **43%** |
| detail after the block | at most 10 lines | median **2,958 chars** |
| replies over 3,000 chars | — | **46%** |
| ends in a decision menu | zero is normal | **28%** |

A rule carrying the words "no exceptions" was violated in 57 percent of the
replies in the very session that introduced it. Nothing about that rule is
unclear. It lost because it was one section among twenty-two.

## MR-8 — Prefer deleting the stale rule to reconciling the conflict

When two rules disagree, first ask whether either should still exist.
Reconciling preserves both, including the wrong one.

**Audit test.** Before proposing a merge or a precedence clause for two
conflicting rules, state the correct end state. If it deletes one of them,
there is no conflict to reconcile.

---

## Applying these

A guidance audit reports, per finding: the meta-rule violated, the exact lines,
what the reader does wrong as a result, and the minimum edit. Findings are
advisory. Guidance files are hand-written by their owner and Quartermaster
never rewrites the hand-written region — FR-122 confines managed additions to a
delimited section, and that boundary holds for audit output too.
