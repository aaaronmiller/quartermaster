# System audit

Where skills live, how they reach each harness, and whether every harness
sees the version you think it does. Run this before judging individual
skills: a defect that exists because of copying is fixed once in the system,
not once per skill.

## Contents

1. Map the layers
2. Harness discovery paths
3. Parity and double loading
4. Budget per harness
5. Target architecture
6. Report

## 1. Map the layers

A personal collection usually has four layers. Identify each one by
inspection, not from documentation:

| Layer | Question | How to find it |
| --- | --- | --- |
| Authoring source | Where is each skill edited? Own skills in a git repo; downloaded skills in upstream clones | the operator's skill repos; `git remote -v` |
| Aggregation | Which tool gathers sources into one set? | sync tool config (for example a `config.yaml` with `source:` and `targets:`) |
| Delivery | How does the set reach each harness: symlink, copy, or the harness reading a shared folder? | `ls -l` on each target; link targets |
| Harness load | What does the harness actually list to the model? | the harness diagnostic (`/doctor`, `/context`, startup warnings), or the skill list it prints |

Record for every skill: its authoring source, whether it is own, modified
or downloaded, and every path a harness loads it from.

## 2. Harness discovery paths

Verify against the harness docs at audit time; these change.

| Harness | User-level paths it reads |
| --- | --- |
| Claude Code | `~/.claude/skills/`, plugin skills, `--add-dir` folders |
| Codex | `$HOME/.agents/skills` (user), `/etc/codex/skills` (admin), bundled system skills; older installs also used `~/.codex/skills` |
| Gemini CLI | `~/.gemini/skills/` and the `~/.agents/skills/` alias (alias wins on name clash) |
| OpenCode | `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/` |
| Pi | its user skills dir, plus `~/.agents/skills/` |
| Kilo Code | `~/.kilo/skills/`, plus compatibility dirs `.claude/skills/` and `.agents/skills/` |
| Hermes | `~/.hermes/skills/` plus configured external dirs |

Two consequences:

- `~/.agents/skills/` is read natively by several harnesses. One copy there
  can replace several per-harness copies.
- Harnesses that read several folders load a skill once per folder it
  appears in. Syncing the same set into `~/.claude/skills/` and
  `~/.config/opencode/skills/` gives OpenCode duplicates.

## 3. Parity and double loading

`scripts/inventory.py` reports:

- **Name parity:** skills present in one harness and missing in another.
- **Content parity:** same name, different SKILL.md hash across locations.
  Each divergence needs one canonical version chosen.
- **Unmanaged copies:** real directories inside a harness folder that the
  sync tool does not manage. They drift silently.
- **Double loading:** for harnesses that read several folders, skills that
  appear in more than one of them.
- **Name mismatches:** directory name differs from frontmatter `name`; the
  harnesses disagree on what the skill is called.

## 4. Budget per harness

For each harness: the active model's context window, the listing fraction
or cap (see `description-standard.md` section 1), the resulting character
budget, the count of model-invocable skills, and the current listing total.
Over budget means some skills cannot be chosen from intent in that harness
today. State it as a number: "listing 73,000 chars against 32,000 budget;
about 130 skills have no visible description".

## 5. Target architecture

Recommend toward these properties, and say which ones the current setup
lacks:

1. One authoring source per skill. Own skills in the own repo; downloaded
   skills in their upstream clone, never edited in place.
2. One aggregation tool. Two tools writing into the same harness folders is
   the usual cause of unmanaged copies and divergence.
3. Delivery by symlink, not copy, so an edit reaches every harness at once.
4. A shared folder (`~/.agents/skills/`) for harnesses that read it, and
   per-harness targets only for harnesses that do not.
5. A loadout per harness that fits its budget: a core set everywhere, packs
   enabled where they are used, the rest installed but not model-invocable.
6. A repeatable check (this skill's `system` mode) after every sync.

## 6. Report

Write `system-audit.md` with: the layer map, the per-harness table (paths,
skill count, unmanaged count, listing size, budget), divergent copies with
their hashes, double loading, generator defects found (for example repeated
bodies traced to a commit), and the recommended changes split into safe
repairs and operator decisions.
