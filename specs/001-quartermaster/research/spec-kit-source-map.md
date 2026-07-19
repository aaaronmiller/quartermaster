---
date: "2026-07-19"
version: "1.0.0"
status: verified-source-map
tags: [quartermaster, spec-kit, provenance, cass, authority]
---
# Quartermaster Spec Kit Source Map

## Reproducible discovery query

```bash
cass index --full
cass search quartermaster --robot-format sessions
python3 scripts/mine-quartermaster-intent.py \
  --sessions /home/cheta/code/agentic-operating-system/recovery/2026-07-19-quartermaster-prelaunch/cass-quartermaster-sessions.txt \
  --json specs/001-quartermaster/research/quartermaster-user-prompts.raw.json \
  --markdown specs/001-quartermaster/research/quartermaster-user-prompt-corpus.md
git log --follow --format='%h %ad %s' --date=iso -- <artifact>
```

The session search finds the human corrections made during implementation. Git
history identifies which documents existed before the Spec Kit translation and
which were generated or corrected afterward.

## Artifact lineage

| Authority | Artifact | Origin and date | Use |
|---|---|---|---|
| 1 | Current valid user instructions | 2026-07-19 conversation | Governing corrections and launch boundary |
| 2 | `specs/requirements.md` | Commit `5b9f0a8`, 2026-06-25 | Original product requirements |
| 2 | `specs/design.md` | Commit `5b9f0a8`, 2026-06-25 | Original pre-build design intent |
| 3 | `.specify/memory/constitution.md` | Present by 2026-06-26 | Durable safety and architecture constraints |
| 4 | `specs/001-quartermaster/spec.md` | Generated in `5b9f0a8`; corrected in `6229bbf`, 2026-06-29 | Current FR/NFR contract |
| 4 | `specs/001-quartermaster/plan.md` | Generated in `5b9f0a8`; corrected in `6229bbf`, 2026-06-29 | Current implementation architecture, except where superseded below |
| 5 | `specs/001-quartermaster/tasks.md` | Rebuilt in `6229bbf`; completed through `699cc4c`, 2026-06-29 | Canonical execution ledger; append corrective work here |
| 6 | `specs/001-quartermaster/design/*.md` | 2026-06-29 through 2026-07-10 | Narrow implementation decisions |
| Evidence | CASS raw and curated prompt corpora | Refreshed and reviewed 2026-07-19 | Historical user corrections and execution expectations |

## Rejected authorities

- `specs/001-quartermaster/archive/tasks-v2-broken.md` and
  `archive/backup-v1`: obsolete task decompositions explicitly rejected by the
  user and by `AGENTS.md`.
- `_agentic-os-source-vault/prior-master/KILLMENOW/plans/tasks/04-quartermaster-tasks.md`:
  generated cross-project task material, not a product specification.
- Existing harness deployment directories: operational residue, not a clean
  source of truth for the Quartermaster cut-over.

## Conflict resolution

The 2026-06-29 plan chose an aggregated managed copy as the deployment source,
with linked subtrees as an exception. The 2026-07-19 instruction instead makes
canonical Git working trees and custom-skills the physical sources, organized in
a Quartermaster library through source-grouped symlinks. The newer instruction
governs. Quartermaster may build an indexed catalog and generated deployment
state, but must not create a second editable copy of source artifacts.

The original plan also contemplated adopting existing deployments. The current
instruction rejects that baseline because the present target state is known to
be disorganized. Prelaunch configuration starts from declared canonical sources;
existing target files are audit input only and are not imported as authority.
