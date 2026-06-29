---
date: 2026-06-29 12:00:00 America/Los_Angeles
ver: 1.0.0
author: codex
model: gpt-5
tags: [quartermaster, design, deploy, flatten, collisions, fr-041, spike]
---

# Spike T105a — Flatten Collision Policy (FR-041)

## Why a spike

Flat-only harnesses can discover only direct children of a target directory.
Quartermaster must preserve the developer's nested library taxonomy while
deploying artifacts into a flat target. Two nested artifacts can share the same
basename, so a naive `basename(path)` flatten would overwrite or hide one of
them.

## Decision 1 — Deterministic path-derived names

Flattening starts with the basename. If more than one artifact maps to that
basename, prepend parent directory segments from nearest to farthest until every
target name is unique.

Example:

| Source | Initial flat name | Collision-safe target |
|--------|-------------------|------------------------|
| `research/deep/SKILL.md` | `SKILL.md` | `deep-SKILL.md` |
| `writing/deep/SKILL.md` | `SKILL.md` | `writing-deep-SKILL.md` |

If parent segments are still insufficient, use the full organizational path with
path separators converted to `-`. If uniqueness still cannot be established,
the plan reports a skip/collision error instead of auto-overwriting.

## Decision 2 — Report-and-skip beats silent overwrite

Auto-renaming is allowed only when the rename is deterministic and derived from
the library path. Quartermaster never overwrites a colliding target silently. If
the collision resolver cannot create a unique name, the deployment plan must
surface the affected source paths and skip those placements.

## Decision 3 — Library paths never change

Flattening changes only the generated target path. `Artifact.path` and
`Artifact.organizationalPath` remain unchanged in the catalog, before and after
planning or deployment.

## Implementation consequences

- `flattenOperations` must keep target directories while replacing filenames.
- Collision-safe names are derived from source organizational path segments.
- The deploy preview test must prove nested artifacts get distinct flat targets.
- FR-002's recorded organizational path remains the source of truth.
