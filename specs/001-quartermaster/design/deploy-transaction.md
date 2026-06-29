---
date: 2026-06-29 12:00:00 America/Los_Angeles
ver: 1.0.0
author: codex
model: gpt-5
tags: [quartermaster, design, deploy, rollback, transactions, snapshots, fr-046, spike]
---

# Spike T120a — Deploy Transaction and Snapshot Model (FR-046)

## Why a spike

Rollback previously restored target files from the current library source. That
is wrong when the target already contained different content before deployment.
Rollback must restore the target's prior state, not whatever the library happens
to contain later.

## Decision 1 — Snapshot target state before each write

Before replacing a target, capture:

- `kind`: `missing`, `file`, or `symlink`
- `content`: prior file bytes as UTF-8 text for regular files
- `symlinkTarget`: prior link destination for symlinks
- `permissions`: mode bits for regular files
- `contentHash`: hash for diagnostics

If the target is absent, record `kind: missing`; rollback removes any file that
deployment created at that path.

## Decision 2 — Operation-local journal in the deployment record

The deployment record stores the plan after apply, with each operation's
`priorState` populated. This keeps rollback local-first and independent of temp
backup directories that may be deleted.

## Decision 3 — Apply order and failure recovery

Apply operations sequentially. After each successful placement, keep its prior
state in memory and in the plan object. If a later operation fails, immediately
restore all previously applied operations in reverse order. A failed deploy must
return operation statuses that make the partial failure visible.

## Decision 4 — Rollback semantics

Rollback walks the recorded operations in reverse order and restores each
operation's captured prior state:

- `missing`: delete target if present
- `file`: write captured bytes and restore permissions
- `symlink`: recreate the prior symlink

Rollback never reads from `sourcePath` except for diagnostics.

## Implementation consequences

- `DeploymentOperation.priorState` gains `kind`, `content`, and `symlinkTarget`.
- `placer.ts` captures actual target state and can restore it during failed apply.
- `rollback.ts` restores recorded prior state byte-for-byte.
- Tests must cover pre-existing different target content and created-file removal.
