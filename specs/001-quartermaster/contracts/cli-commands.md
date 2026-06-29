---
date: 2026-06-28
ver: 2.0.0
title: Quartermaster CLI Command Contract
tags: [contract, cli, commands]
---

# CLI Command Contract

> Complete specification of all Quartermaster CLI commands, their arguments, and behavior.

## Conventions

- Commands follow the pattern: `qm <subcommand> [<action>] [<args>] [--flags]`
- Global flags: `--help`, `--version`, `--verbose`, `--json` (machine-readable output)
- All paths are project-relative unless absolute paths are specified
- `--yes` flag skips confirmation prompts for non-interactive use

## Command Specifications

### qm scan
Scan library roots and update the catalog. Incremental by default.
```
qm scan [--root PATH ...]
```
- `--root`: One or more library root directories to scan
- Forces a full scan if no previous scan exists
- Incremental rescan uses content hashing to detect changes
- Output: ScanResult with counts of added/changed/removed artifacts, parse errors

### qm import
Import artifacts from a source.
```
qm import <source>
```
- Source formats:
  - `owner/repo` — GitHub repository (top-level artifacts)
  - Full git URL — any git repository
  - `owner/repo:path` — subdirectory within a repository
  - Marketplace ID — from configured marketplace registry
  - Local path — absolute or relative filesystem path
- Imports all artifacts found at the source into the library
- Records provenance (source, revision, import time)

### qm sync
Check or update upstreams.
```
qm sync [<source>] [--check]
```
- Without arguments, syncs all configured upstreams
- `--check`: Reports upstream status without writing
  - Status per artifact: unchanged, ahead, conflict
- Never overwrites locally modified artifacts without `--yes`
- Honors pinned sources (does not advance them)

### qm audit
Print the compatibility matrix.
```
qm audit [--harness ID] [--type T] [--only blocked|transform]
```
- `--harness`: Filter to specific harness profile
- `--type`: Filter to specific artifact type
- `--only`: Show only blocked (incompatible) or transform-required artifacts
- Default: Full matrix across all artifacts and all harnesses

### qm plan
Dry-run deployment plan.
```
qm plan <harness|group|all> [--scope PROFILE|--tag T|--path SUBTREE]
```
- Target: single harness name, named group, or "all"
- `--scope`: Deploy only artifacts matching a profile, tag, or subtree
- No disk writes — output is a dry-run plan
- Lists: placements with location+method, transformations, skips with reasons

### qm deploy
Apply a deployment plan.
```
qm deploy <harness|group|all> [--scope ...] [--yes]
```
- Shows the plan and waits for confirmation unless `--yes`
- Records deployment for reversal
- On failure: stops, reports recoverable partial state

### qm revert
Reverse a recorded deployment.
```
qm revert <deployment-id | --last>
```
- Restores target to pre-deployment state using captured prior state
- `--last`: Revert most recent deployment

### qm status
Show deployment status.
```
qm status [<harness>]
```
- Per artifact: deployed method (link/copy), in-sync or drifted
- Reports orphaned deployments (artifacts in target but not in library)

### qm profile
Manage harness profiles.
```
qm profile list
qm profile show <id>
qm profile new <id>
qm profile edit <id>
qm profile validate <id>
```

### qm new
Scaffold a self-authored artifact.
```
qm new <type> <org-path>
```
- `type`: One of: skill, plugin, agent, hook, mcp, command, output_style, script
- `org-path`: Library subfolder where the artifact should be created
- Creates a stub with appropriate metadata for the artifact type

### qm compose
Optional: validate a composition.
```
qm compose validate <composition.yaml>
```

### qm loadout
Manage named loadouts.
```
qm loadout list
qm loadout new <name>
qm loadout add <name> <artifact|pipeline>
qm loadout assign <name> <harness>
qm loadout switch <harness> <name>
qm loadout copy <name> <from-harness> <to-harness>
```

### qm pipeline
Define and attach pipelines.
```
qm pipeline list
qm pipeline new <name>
qm pipeline validate <name>
qm pipeline add-to <loadout> <name>
```

### qm evaluate
Run advisory agentic evaluation.
```
qm evaluate grade <artifact ...> --categories C[,C] [--model M]
qm evaluate compare <artifact> <artifact ...> --categories C[,C] [--model M]
qm evaluate propose-loadouts [--model M]
qm evaluate build-pipelines [--instruction "..."] [--max-turns N] [--model M]
```

### qm proposal
Review and act on agentic proposals.
```
qm proposal list
qm proposal show <id>
qm proposal accept <id>
qm proposal reject <id>
```

### qm guidance
Manage canonical and per-harness guidance files.
```
qm guidance edit
qm guidance deploy <harness|all>
```

### qm safety
Manage safety auditors.
```
qm safety register <auditor>
qm safety scan <artifact|--all>
qm safety threshold <score>
```

### qm query
Stable, machine-readable agent query interface.
```
qm query list [--type T]
qm query search <q>
qm query describe <artifact>
qm query audit <artifact>
qm query scaffold <type> [--path ORG_PATH]
```

### qm tui / qm web
Launch UI surfaces.
```
qm tui
qm web [--port N]
```
