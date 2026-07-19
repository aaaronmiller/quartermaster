---
id: current-model
title: Verified prelaunch model
updated: 2026-07-19
---

## Source-linked library

`~/.quartermaster/sources.yaml` declares seven canonical source roots. The
managed library at `~/.quartermaster/library` contains provenance-grouped
symlinks under `first-party/`, `third-party/`, and `harness-defaults/`; it does
not contain editable copies. The existing harness deployment directories were
not imported.

The clean catalog is `~/.quartermaster/catalog-v3-prelaunch.db`. It contains 437
distinct identities and paths: 235 active and 202 specialist/library-only.
Duplicate bytes are retained as 45 duplicate-content groups without identity
collisions. Every row records its source ID and resolved canonical path.

## Corrected catalog behavior

- Artifact IDs survive content edits and unambiguous package moves.
- Identical content at different paths receives distinct identities.
- A `SKILL.md` package is one artifact; scripts, references, and assets affect
  its package hash but are not cataloged as standalone skills.
- Nested `SKILL.md` packages remain independently discoverable.
- Full scans remove stale rows under scanned roots.
- Quality grade is metadata, not a runtime capability.
- Twelve current harnesses are represented by declarative profiles.

## Activation state

The active `core-custom-skills` loadout is assigned to all 12 current harness
profiles. It contains 29 top-level custom skills. Imagegen is included after a
successful Codex CLI image-generation smoke test and a recorded safety override.
Damage Control is excluded until its copies and versions are reconciled, as
directed by the user.

The installed `qm` is the built v3.0.0 binary. Its Codex deployment preview
contains 29 operations and zero exclusions, all from active `custom-skills`.
The preview was not applied.
