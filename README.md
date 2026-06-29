---
date: 2026-06-29 12:00:00 PDT
ver: 1.0.0
author: claude-opus
model: claude-opus-4-8
tags: [quartermaster, cli, catalog, deploy, audit, loadouts, pipelines, safety, mcp, surfaces]
---
# Quartermaster

Quartermaster manages a local library of agent artifacts and deploys compatible artifacts into configured harness profiles.

## Commands

Every command supports `--json` for machine-readable output and exits nonzero with a plain-language `reason` on failure. Run `qm --help` for the authoritative list.

**Catalog & ingestion**
- `qm scan [roots] [--incremental]` — scan library roots into the catalog
- `qm list` / `qm search` — filter by type, capability, source, path, or free text
- `qm import <source> [--kind=...]` — import from git, git subdir, marketplace, or local path
- `qm sync [--check] [--confirm]` — check or update upstreams (never silently overwrites local edits)
- `qm pin <artifact> <rev>` / `qm unpin <artifact>` — pin artifacts to a revision
- `qm new <type> <path>` — scaffold a self-authored artifact

**Profiles, audit & deploy**
- `qm profile add/edit/list/validate` — manage declarative harness profiles
- `qm audit [--matrix]` / `qm audit override <artifact> <harness> --status --note` — compatibility verdicts
- `qm audit risk` / `qm audit safety <artifact>` — risk + safety scanning
- `qm deploy <harness|--all> [--scope=...] [--yes]` — dry-run by default, apply with `--yes`
- `qm rollback <deployId>` — reverse a recorded deployment
- `qm status <harness>` — deployed artifacts, drift, and orphans

**Loadouts, pipelines & guidance**
- `qm loadout create/add/add-pipeline/assign/copy/status` — named artifact + pipeline sets
- `qm pipeline create/get/delete/list/validate/propose` — ordered skill pipelines
- `qm guidance render <harness> [--source=...]` — render CLAUDE.md / AGENTS.md with managed sections

**Advisory evaluation (model-backed, never auto-applied)**
- `qm eval config|grade|compare|investigate` — advisory grading/comparison
- `qm proposal list/accept/reject/edit` / `qm propose loadouts` — review proposals

**Safety & agent surfaces**
- `qm safety allowlist|threshold|override|audit` / `qm allowlist add/remove/list` — auditor orchestration
- `qm query list-skills|search|get|audit|scaffold|status` — stable machine-readable agent interface
- `qm mcp status|serve` — optional MCP server (disabled by default; CLI stays primary)

**Surfaces & config**
- `qm tui` — dark-mode-first terminal dashboard
- `qm web [--port=N]` — local (127.0.0.1) dark-mode-first web UI
- `qm config get/set/list/path` — local configuration
- `qm compose validate <chain.json>` — optional composition validation (see below)

## Optional Composition

Composition validation is optional and disabled by default. It validates Noun/Verb/Adjective artifact chains before a composed run:

- Nouns and verbs connect through matching output/input labels.
- Cycles are rejected.
- Adjectives can attach only to artifacts marked `enhanceable`.

Enable it with config:

```json
{
  "composition": {
    "enabled": true
  }
}
```

Or for one command:

```bash
QM_COMPOSITION_ENABLED=true qm compose validate chain.json --json
```

When disabled, composition validation returns `ok: true`, `disabled: true`, and no issues. Core scan, audit, and deploy flows do not depend on composition.
