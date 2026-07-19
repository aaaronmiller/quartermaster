---
date: "2026-07-19"
version: "1.0.0"
status: governing-intent
tags: [quartermaster, user-intent, source-library, skills, pipelines]
---
# Quartermaster Governing Instructions

## Purpose

Quartermaster is the control plane for discovering, organizing, evaluating,
composing, and selectively deploying agent skills and related artifacts across
multiple harnesses. It replaces a fragmented sync layer with a clean,
source-aware system. It must reduce active context and filesystem clutter, not
copy the current disorder into a new database.

## Authority

Apply sources in this order:

1. Current valid user corrections.
2. Original `specs/requirements.md` and `specs/design.md` intent.
3. The project constitution.
4. Current generated specification and plan.
5. Canonical `tasks.md` implementation ledger.
6. Historical sessions and archived documents as evidence only.

See `research/spec-kit-source-map.md` and
`research/quartermaster-user-prompt-corpus.curated.md` for provenance.

## Non-negotiable behavior

1. Keep one stable identity for each logical artifact across content edits,
   scans, source moves, and duplicate-content occurrences. Content hashes detect
   revisions; they are not primary identities.
2. Treat a packaged skill as one artifact rooted at `SKILL.md`. Its scripts,
   references, assets, and examples are package members, not independent skills.
3. Permit identical content at different source paths without catalog failure.
   Record duplicate relationships and aliases without discarding provenance.
4. Keep canonical content in its existing Git or user-owned source. Build the
   Quartermaster library as source-grouped links and indexed metadata, not as a
   second editable copy.
5. Separate first-party/user, third-party, harness-default, deprecated, and
   specialist/library-only skills. Physical layout is by provenance source;
   lifecycle, domain, function, and quality are metadata-backed views.
6. Catalog the larger curated library without activating or deploying all of it.
   A harness receives only its assigned loadout and compatible dependencies.
7. Do not adopt current deployed target directories as the clean baseline.
   Inspect them for conflicts, but derive the new catalog from declared sources.
8. Prefer symlink deployment and source links where supported. Every mutation
   requires a dry-run, explicit apply, operation record, and rollback evidence.
9. Support all currently used harnesses through declarative profiles, not
   hard-coded branches. At minimum cover Claude Code, Codex, Gemini, Antigravity,
   OpenCode, Qwen, Hermes, Pi, Oh My Pi, OpenClaw, Ante, and Kilo Code.
10. Grade, comparison, and agentic recommendations are advisory. A quality grade
    must never be inferred as a runtime capability.
11. Surface source, revision, status, risk, tags, function, domain, compatibility,
    active loadouts, pipelines, and update state in CLI and web views.
12. Never mark a task or feature complete without its stated verification.

## Source library model

The managed library is an inventory of links plus metadata:

```text
library/
  first-party/
    custom-skills -> /home/cheta/code/custom-skills
    <project-name> -> <canonical-git-working-tree-or-skill-subtree>
  third-party/
    <source-name> -> <canonical-git-working-tree-or-skill-subtree>
  harness-defaults/
    <harness-name> -> <curated-default-source>
  registry.yaml
```

Each registry source records ownership class, canonical path, optional remote,
revision, subpath, trust state, update policy, and enabled state. Lifecycle
labels such as `active`, `specialist`, `deprecated`, `superseded`, and
`quarantined` belong to artifact metadata. Domain and functional labels must be
available through normalized frontmatter or catalog overrides without rewriting
third-party source files.

## Classification and discovery

Classification is multi-axis:

- Provenance: first-party, third-party, harness-default.
- Lifecycle: active, specialist, deprecated, superseded, quarantined.
- Function: coding, audit, research, design, writing, media, operations,
  planning, memory, orchestration, safety, or another explicit registry value.
- Composition role: noun, verb, adjective/modifier, or coordinator.
- Cost: always-loaded, on-demand, expensive, external-service, or local-only.
- Trust and quality: source trust, audit status, quality grade, and evidence date.

The web and CLI catalog must sort and filter on these axes. Third-party files do
not need invasive frontmatter edits: registry overrides may supply normalized
metadata while preserving upstream bytes.

## Pipelines and relationships

Quartermaster must support reusable pipeline templates such as code audit, full
development, advertising, research, and release. Pipelines define ordered or
structured skill use, prerequisites, compatible modifiers, expected outputs,
and harness constraints.

Relationship suggestions should combine:

- explicit pipeline membership;
- declared `works-with`, `requires`, `enhances`, and `supersedes` metadata;
- accepted proposal history;
- optional local co-use telemetry that contains artifact identifiers only and is
  disabled unless explicitly enabled;
- importable third-party relationship datasets with recorded provenance.

General modifier skills, such as deliberative refinement or goal setting, must
be modeled as composable modifiers rather than forced into a task domain.

## Cut-over and launch boundary

Prelaunch work may inspect sources, migrate Quartermaster's own schema, create
the source-link library, populate a new catalog, run deterministic tests, build
and install the CLI, and produce dry-run plans. It must not deploy loadouts to
harnesses, overwrite existing harness state, start the Quartermaster web/TUI
server, or switch production synchronization to Quartermaster until separately
authorized.

The first later cut-over must target one harness, preserve a rollback record,
and be verified before other harnesses migrate individually.

## Deferred work

- Vision-enabled usability audit of Living Document layouts.
- Scheduled recurring CASS intent consolidation across projects.
- Production cut-over from Agents/Skillshare to Quartermaster.
- Remote/shared skill-relationship service; begin with a local provenance-aware
  dataset and evaluate external sources before adding network dependence.

## Completion gate for this prelaunch phase

1. Historical intent corpus and source map exist and are reproducible.
2. Catalog handles stable identities, packages, and duplicate content.
3. Source registry and source-grouped link library are configured from canonical
   sources without moving or copying them.
4. Profiles cover the current harness set.
5. Classification, pipeline templates, and relationship metadata are queryable.
6. Installer, CLI, lint, typecheck, build, and full tests pass.
7. Installed `qm` matches the built artifact.
8. No harness deployment or Quartermaster UI/server launch occurs.
