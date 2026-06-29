---
date: 2026-06-28
ver: 2.0.0
author: quartermaster-quickstart
tags: [quartermaster, quickstart, development, setup]
---

# Quartermaster — Development Quickstart

> Validation guide for setting up Quartermaster and confirming the feature works end-to-end.

## Prerequisites

- **Bun** 1.2+ (runtime, package manager, test runner, compiler)
- **Git** (for upstream sync and remote import)
- **OpenAI-compatible model endpoint** (optional, for agentic evaluation)
- **SkillScan** (optional, for safety auditing)

## Setup

```bash
# Clone the repository
git clone https://github.com/ice-ninja/quartermaster.git
cd quartermaster

# Install dependencies
bun install

# Initialize the catalog database (auto-created on first scan)
bun run qm scan ./test-fixtures/library

# Verify installation
bun run qm --help
```

## Quick Validation Scenarios

### 1. Basic Scan and Catalog

```bash
# Create a test library with nested subfolders
mkdir -p test-fixtures/library/research/deep-research
mkdir -p test-fixtures/library/web/frontend-design
# ... populate with test artifacts ...

# Scan the library
bun run qm scan ./test-fixtures/library

# Expected: All artifacts cataloged with correct types, subfolder paths preserved
bun run qm query list --json
```

### 2. Compatibility Audit

```bash
# Run audit across all harnesses
bun run qm audit

# Expected: Compatibility matrix showing each artifact's verdict per harness
# A hook artifact should show "incompatible" for no-hook harnesses with a reason
```

### 3. Dry-Run Deployment

```bash
# Preview deployment to Claude Code (dry-run by default)
bun run qm deploy claude-code

# Expected: Dry-run output listing every placement, method, transformation, and skip
# No disk writes
```

### 4. Full Deployment and Verification

```bash
# Deploy (apply changes)
bun run qm deploy claude-code --yes

# Expected: 
#   - Nested skills flattened and discoverable by Claude Code
#   - Hooks deployed only to hook-supporting harnesses
#   - MCP configs translated to target format
#   - Incompatible artifacts skipped with reasons

# Verify deployment status
bun run qm status claude-code

# Expected: Each deployed artifact shown with method (link/copy), in-sync status
```

### 5. Deployment Reversal

```bash
# Revert a recorded deployment by id (see deploy/status output)
bun run qm rollback <deployId>

# Expected: Target harness restored to pre-deployment state
```

### 6. Loadout Management

```bash
# Define a coding loadout
bun run qm loadout create coding

# Add artifacts to the loadout
bun run qm loadout add coding some-skill
bun run qm loadout add coding another-skill

# Assign loadout to a harness
bun run qm loadout assign coding claude-code

# Expected: Harness now has only coding loadout artifacts active
```

### 7. Agentic Evaluation (if configured)

```bash
# Grade an artifact
bun run qm eval grade my-skill --categories quality,clarity,usefulness

# Propose loadouts from catalog
bun run qm propose loadouts

# Review proposals
bun run qm proposal list
bun run qm proposal accept <id>   # or: reject / edit

# Accept a proposal
bun run qm proposal accept <id>
```

### 8. Guidance File Management

```bash
# Render guidance for a harness (also deployed automatically by `qm deploy`)
bun run qm guidance render claude-code --source ./GUIDANCE.md

# Guidance is placed per harness during `qm deploy <harness> --yes`

# Expected: 
#   - CLAUDE.md for Claude Code
#   - AGENTS.md for Codex, OpenCode, Antigravity
#   - Managed sections clearly delimited
#   - Developer-authored content outside managed sections preserved
```

### 9. Source Sync

```bash
# Import a skill from a git repository
bun run qm import owner/repo

# Check for upstream updates
bun run qm sync --check

# Apply updates (without overwriting local modifications)
bun run qm sync
```

### 10. Safety Audit

```bash
# Run a safety audit on an artifact (also runs automatically on import/scan)
bun run qm safety audit my-skill

# Set deployment gate threshold
bun run qm safety threshold 0.6

# Expected: Artifacts below threshold blocked from deployment
```

## Project Structure Reference

```
quartermaster/
├── src/
│   ├── domain/            # Artifact, Source, HarnessProfile, Verdict, Loadout, etc.
│   ├── catalog/           # scan, classify, search
│   │   └── capabilities/  # capability and dialect inference
│   ├── sources/           # import and sync
│   ├── profiles/          # harness profile loader, validator, registry
│   ├── audit/             # pure verdict engine and matrix
│   ├── deploy/            # plan, apply, revert, status
│   │   └── adapters/      # link-or-copy, flatten, config translators
│   ├── loadouts/          # define, assign, switch, copy
│   ├── pipelines/         # define, validate, expand
│   ├── guidance/          # canonical + per-harness rule files
│   ├── eval/              # agentic evaluation, model router
│   ├── audit-safety/      # auditor orchestration
│   ├── compose/           # optional NVA composition validator
│   ├── query/             # stable agent query operations
│   ├── db/                # bun:sqlite store and migrations
│   ├── cli/               # command surface
│   ├── tui/               # OpenTUI terminal interface
│   └── web/               # Hono server + Svelte 5 dark-mode client
├── profiles/              # built-in harness profiles (yaml)
│   ├── claude-code.yaml
│   ├── codex.yaml
│   ├── antigravity.yaml
│   └── opencode.yaml
├── tests/
└── package.json
```

## Development Commands

```bash
bun run test          # Run unit and integration tests
bun run test:watch    # Watch mode
bun run build         # Compile to single binary (bun build --compile)
bun run qm            # Run the CLI
bun run qm tui        # Launch TUI
bun run qm web        # Serve web interface
```

## Performance Benchmarks

| Benchmark | Target | How to Verify |
|-----------|--------|---------------|
| Full scan, 1000 artifacts | under 10 s | `time bun run qm scan --root ./bench-library` |
| Incremental rescan | under 2 s | `time bun run qm scan` after single artifact change |
| Audit, 1000 artifacts x 10 harnesses | under 5 s | `time bun run qm audit --all` |
| Catalog search, 1000 artifacts | under 1 s | `time bun run qm query search --term "test"` |
