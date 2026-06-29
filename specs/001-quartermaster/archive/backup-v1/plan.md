# Implementation Plan: Quartermaster

**Branch**: `001-quartermaster` | **Date**: 2026-06-26 | **Spec**: `specs/001-quartermaster/spec.md`

**Input**: Feature specification from `specs/001-quartermaster/spec.md` and technical design from
`design.md`

## Summary

Build Quartermaster as a local-first Bun and TypeScript tool that maintains one organized source
library of agent artifacts, catalogs and audits compatibility against declarative harness profiles,
compiles dry-run deployment plans, applies reversible symlink-or-copy deployments, manages loadouts
and guidance files, orchestrates external safety scanners, and records advisory agentic evaluation
proposals without allowing model output to mutate deterministic state automatically.

## Technical Context

**Language/Version**: TypeScript on Bun

**Primary Dependencies**: Bun runtime, `bun:sqlite`, YAML parser, TOML parser, JSON parser, system
`git`, OpenTUI for terminal UI, Hono and Svelte 5 for local web UI, shadcn-svelte for web controls,
external safety scanners invoked as subprocesses, OpenAI-compatible model gateway for advisory
evaluation

**Storage**: Embedded SQLite catalog database plus YAML harness profiles and filesystem artifact
library

**Testing**: Bun test runner for unit and integration tests; CLI-level integration tests with
temporary library and target directories

**Target Platform**: Local developer workstation, primarily WSL2/Linux, with copy fallback for
Windows-hosted targets that cannot rely on symlinks

**Project Type**: Local-first CLI with shared domain core, TUI, local web app, and agent query
surface

**Performance Goals**: Incremental rescans avoid reprocessing unchanged artifacts; CLI commands
start quickly enough for repeated agent use; compatibility matrix generation remains usable for
large personal libraries

**Constraints**: No remote service required; network only for upstream sync, remote import,
registry lookup, or explicit model calls; deterministic core cannot depend on advisory model
calls; deployment defaults to dry-run; destructive operations require explicit confirmation

**Scale/Scope**: Personal-to-power-user artifact collections spanning many upstream repositories,
many harness profiles, multiple named loadouts, and all eight artifact types defined in the spec

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **PASS - I. Local-First Source of Truth**: The plan uses an aggregated managed library as the
  read-only deployment source of truth, with catalog state in SQLite and no remote service
  dependency.
- **PASS - II. Compatibility Before Deployment**: Harness profiles are declarative YAML data, and
  the audit engine computes verdicts before deployment using type, capability, and dialect data.
- **PASS - III. Previewed, Reversible, Non-Destructive Change**: Deployments default to dry-run,
  applied operations record prior state, and sync/deploy paths must not overwrite local changes
  without confirmation.
- **PASS - IV. Deterministic Core, Advisory Agentic Layer**: Catalog, audit, deploy, loadout, and
  guidance engines are deterministic; model-driven evaluation stores proposals only.
- **PASS - V. Provenance, Safety, and Faithful Guidance**: Sources, revisions, imports, auditor
  findings, and managed guidance sections are first-class data; documentation is derived from real
  `requirements.md` and `design.md` inputs.

## Project Structure

### Documentation (this feature)

```text
specs/001-quartermaster/
├── constitution-source.md
├── requirements.md
├── design.md
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── cli.md
│   ├── profile-schema.md
│   └── agent-query.md
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── cli/
├── core/
│   ├── catalog/
│   ├── audit/
│   ├── deploy/
│   ├── loadouts/
│   ├── guidance/
│   ├── safety/
│   └── evaluation/
├── profiles/
├── storage/
├── tui/
├── web/
│   ├── server/
│   └── app/
└── query/

tests/
├── unit/
├── integration/
├── contract/
└── fixtures/
```

**Structure Decision**: Use a single TypeScript project with shared domain modules under `src/core`.
CLI, TUI, local web, and agent query surfaces import the same core instead of duplicating harness
logic. Harness profiles remain data under `src/profiles` or a user config directory and are loaded
through the profile registry.

## Phase 0: Research Findings

Research is captured in `specs/001-quartermaster/research.md`.

## Phase 1: Design Artifacts

- Data model: `specs/001-quartermaster/data-model.md`
- CLI contract: `specs/001-quartermaster/contracts/cli.md`
- Harness profile contract: `specs/001-quartermaster/contracts/profile-schema.md`
- Agent query contract: `specs/001-quartermaster/contracts/agent-query.md`
- Quickstart validation: `specs/001-quartermaster/quickstart.md`

## Post-Design Constitution Re-Check

- **PASS - I. Local-First Source of Truth**: Data model centers `Artifact`, `Source`, and
  filesystem library paths; deployments write target records, not library mutations.
- **PASS - II. Compatibility Before Deployment**: Contracts require `qm audit` and `qm deploy`
  preview to report transform and incompatible verdicts before apply.
- **PASS - III. Previewed, Reversible, Non-Destructive Change**: CLI contract separates
  `qm deploy preview`, confirmed `qm deploy apply`, and `qm deploy rollback`.
- **PASS - IV. Deterministic Core, Advisory Agentic Layer**: `EvaluationProposal` is stored as
  advisory data with explicit acceptance state and no automatic deployment effect.
- **PASS - V. Provenance, Safety, and Faithful Guidance**: `Source`, `Auditor`, `AuditFinding`,
  and `GuidanceFile` entities plus contracts cover provenance, scanners, and managed guidance.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| None | N/A | N/A |
