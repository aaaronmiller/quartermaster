---
date: 2026-06-29 00:00:00 UTC
ver: 1.0.0
author: claude-opus
model: claude-opus-4-8
tags: [quartermaster, design, sync, upstream, fr-012, fr-013, spike]
---

# Spike T051a — Sync / Conflict Model (FR-012, FR-013)

## Why a spike

`fetchUpstreamRef` returned `null` for both git and github (confirmed), and the
*model* of "unchanged vs ahead vs conflict" plus the overwrite-safety rule was
never decided. A wrong model here either silently overwrites local edits
(FR-013 violation) or never advances anything.

## Decision 1 — Upstream ref via `git ls-remote` (no API, no tokens)

Fetch the upstream revision with `git ls-remote <url> <ref>`, for BOTH `git` and
`github` sources (github → `https://github.com/{owner}/{repo}`). Rationale:
- No GitHub API token, no 60/hr unauthenticated rate limit, no vendor coupling
  (aligns with NFR-061 provider-agnostic spirit and NFR-031 no-credentials).
- Works for any git host uniformly.
- `marketplace`/`local` sources have no upstream ref → reported `unchanged`.
Failure (offline/unreachable) is reported per-artifact as an error, never a
silent skip (NFR-050).

## Decision 2 — Three states

Per artifact with a remote source and no pin:
- **unchanged** — recorded ref == upstream ref.
- **ahead** — upstream ref differs AND the local artifact is NOT modified.
- **conflict** — upstream ref differs AND the local artifact IS modified.
Pinned artifacts are always reported `pinned` and never compared (FR-014).

## Decision 3 — Local-modification detection

An artifact is locally modified when its current on-disk content hash differs
from the hash recorded at import time. Store `metadata.importedHash` at import.
The scanner updates `hash` (current content); `importedHash` stays fixed until a
sync re-import. `localModifications = hash !== importedHash`. This is computed at
check time so it reflects reality even if the flag was never persisted.

## Decision 4 — check vs sync (read vs write)

- `qm sync --check` → **read-only**: classify every artifact (unchanged/ahead/
  conflict/pinned) and report. No disk writes. (FR-012)
- `qm sync` → apply updates to **ahead** artifacts only; **conflict** artifacts
  are skipped unless `--confirm`, which overwrites and is recorded. Pinned never
  touched. (FR-013)
This separation is the safety boundary: checking never mutates; updating never
silently overwrites a local edit.

## Decision 5 — Update mechanism

Updating re-imports the artifact at the new upstream ref via the existing
ImportManager, then refreshes `metadata.gitRef` and `metadata.importedHash`.
A failed update leaves the prior catalog row intact (no partial write).

## Implementation consequences

- git.ts: add `gitLsRemote(url, ref)` → resolved SHA or null.
- sync.ts: implement `fetchUpstreamRef` via ls-remote; add `checkUpstreams`
  (read-only, classifies ahead/conflict); gate `syncUpstreams` overwrite on
  `confirm`. Record `importedHash` on import (importers.ts).
- T052–T064 implement against this; `qm sync [--check] [--confirm]` + `qm pin`.
