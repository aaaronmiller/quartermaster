# Verdict schema

One JSON file per skill, one per cluster, one verifier result per skill.
`scripts/check_verdicts.py` validates all three against
`templates/verdict.schema.json` and checks hashes, quotes, coverage and
description length.

## Contents

1. Skill verdict
2. Rules and calibration
3. Cluster decision
4. Verifier result

## 1. Skill verdict (`verdicts/<skill>.json`)

```json
{
  "skill": "pdf-tools",
  "path": "/abs/path/to/pdf-tools",
  "provenance": "own",
  "files_read": [{"path": "SKILL.md", "sha256": "<sha256sum output>"}, {"path": "references/forms.md", "sha256": "..."}],
  "category": "documents",
  "secondary_category": "integrations",
  "tags": ["pdf", "forms"],
  "summary": "One sentence: what the skill actually does once loaded.",
  "description": {
    "current": "...",
    "checks": {"D1": "pass", "D2": "fail", "D3": "fail", "D4": "pass", "D5": "pass", "D6": "fail", "D7": "pass", "D8": "pass", "D9": "n/a", "D10": "pass"},
    "proposed": "...",
    "reason": "Why the new text routes better or costs less."
  },
  "findings": [
    {"id": "B-TRIM", "severity": "major", "file": "SKILL.md", "line": 88, "quote": "exact text from that line, 20 or more characters", "fix": "Cut lines 88-140; they restate what the model knows."}
  ],
  "comparisons": [
    {"other": "deslop", "relation": "specialization", "evidence": "R1 lands on both; deslop cleans only the branch diff"}
  ],
  "conflicts": [
    {"kind": "cross-skill", "quote_a": "...", "quote_b": "...", "where_b": "other-skill/SKILL.md:41", "fix": "..."}
  ],
  "relations": [
    {"other": "pdf-forms", "relation": "same-task", "evidence": "Both claim 'fill PDF forms'; requests R1-R3 land on both."}
  ],
  "dependencies": {"skills_called": ["xlsx"], "missing": []},
  "trigger_tests": {"should": ["..."], "should_not": ["..."]},
  "recommendation": "improve",
  "edits": [{"file": "SKILL.md", "old": "exact old text", "new": "replacement"}],
  "confidence": "medium",
  "notes": "allowance:200. usage: unknown. Compared against ..."
}
```

## 2. Rules and calibration

**Reading evidence**

- `files_read[].path` is a POSIX path relative to the skill root
  (`SKILL.md`, `references/forms.md`), never absolute. SKILL.md comes first.
- `sha256` is over the raw bytes, obtained by running `sha256sum <file>`,
  never computed from text as displayed.
- `files_read` covers SKILL.md and every existing file it references. A
  referenced file left unread is named in `notes` with the reason.
- Every finding names its `file` (default SKILL.md), `line`, and a verbatim
  `quote` of at least 20 characters from that exact line (shorter only when
  the quote is the whole line). For an absence (missing example, missing
  validation), quote the heading or line where the missing part belongs.
- `findings: []` is allowed only with a `notes` sentence that starts
  "Checked:" and says what was checked and found clean.
- `relations: []` is allowed only with a `notes` sentence that starts
  "Compared against" and names what was compared.

**Lengths.** Do not count characters by hand. `check_verdicts.py` measures
`current` and `proposed`; keep `proposed` within the allowance given in the
brief. Record that allowance in `notes` as `allowance:<n>`.

**Severity**

| Severity | Use for |
| --- | --- |
| `blocker` | Safety hazard (B-SAFE); routing broken (missing or empty description, malformed frontmatter, invalid name); exact copy or divergence that needs a system fix |
| `major` | A D-check failure that changes routing (D1, D2, D3, D8, D10); a smell or B-check that breaks the job on multi-step work (S-NVS, S-MDT, S-UD, B-MODES, B-REPEAT, B-REF) |
| `minor` | Style, wording, a missing example or table of contents |

**Recommendation**

- One value. `keep` only when nothing above minor remains.
- `retire`, `merge-into`, `absorb`, `convert-to-command` and `name-only`
  are recommendations for the operator, never actions. Any change to a
  `downloaded` skill, or to an `own-copy-diverged` copy, is `escalate`
  unless the brief authorizes it; say why in `notes`.
- `own-copy-diverged`: copy `provenance` from the batch; do not propose body
  edits to one copy; record the divergence and escalate.
- Exact-copy groups (`exact_copies` in `batches.json`) get one verdict under
  the representative name listing every path in `notes`; never edit one
  copy.

**Pair closure.** `comparisons` records the outcome for every review pair
involving this skill, in neighbour-file order: the relation found, or
`compared-no-relation` with the test requests as evidence. Untested pairs
stay visible as untested.

**Changed descriptions.** A changed description on an own or modified skill
requires `trigger_tests`. An `own-copy-diverged` verdict escalates without
editing one copy. Merge or retire at `high` confidence requires usage data;
`usage: unknown` caps them at medium.

**Trigger tests.** Write `trigger_tests` only when the description of an
own or modified skill changed, or when routing between cluster members is
in doubt: about 10 `should` (at least half without the skill's name, varied
wording) and about 10 `should_not` near misses (at least 8 of each). "What is the weather" is not
a near miss for a PDF skill; "merge these two PDFs" is one if another
installed skill owns merging. Do not run them in corpus mode.

**Edits** are proposals; nothing is applied in corpus mode. Edits may add
new sections or files, not only replace text.

## 3. Cluster decision (`clusters/<cluster>.json`)

Write one when two or more members of a cluster are in your batch. If the
cluster is split across batches, write relations in each verdict and leave
the decision to the orchestrator.

```json
{
  "cluster": "writing-humanize",
  "category": "writing",
  "members": ["humanize-writing", "stop-slop", "unslop", "deslop"],
  "same_task_requests": ["make this email sound less like AI", "strip the filler from my draft"],
  "pairs": [{"a": "unslop", "b": "deslop", "relation": "same-task", "evidence": "..."}],
  "rubric": ["names the specific phrases to remove", "gives a before/after example", "covers rhythm, not only vocabulary"],
  "scores": {"humanize-writing": [3, 3, 2], "stop-slop": [3, 1, 1]},
  "order_swapped": true,
  "base": "humanize-writing",
  "grafts": [{"from": "stop-slop", "what": "banned-phrase list", "to": "references/banned-phrases.md"}],
  "refusals": [{"from": "deslop", "what": "code comment cleanup", "why": "different job; belongs to code-quality"}],
  "decisions": {"humanize-writing": "keep, absorb grafts", "stop-slop": "merge-into:humanize-writing", "unslop": "retire", "deslop": "narrow to code"},
  "confidence": "medium"
}
```

Each `scores` list has one number per rubric item. `base` is a member.
`decisions` names every member. `order_swapped` is true only if you
compared in both orders.

## 4. Verifier result (`verify/<skill>.json`)

```json
{
  "skill": "pdf-tools",
  "files_read": [{"path": "SKILL.md", "sha256": "..."}],
  "independent": ["What the verifier found wrong before opening the verdict."],
  "items": [
    {"ref": "findings[0]", "status": "confirmed", "reason": "...", "quote": "..."},
    {"ref": "description.proposed", "status": "rejected", "reason": "collides with pdf-forms", "quote": "..."}
  ],
  "missed": [{"kind": "relation", "detail": "...", "quote": "..."}],
  "agreement": 0.5,
  "notes": "agreement = confirmed / (confirmed + rejected) = 1/2"
}
```

`items` has one entry per worker finding, one for `description.proposed`
(when present), one per relation and one for `recommendation`.
`agreement` is confirmed divided by confirmed plus rejected; `unclear` is
left out.
