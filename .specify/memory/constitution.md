<!--
Sync Impact Report
Version change: template -> 1.0.0
Modified principles:
- [PRINCIPLE_1_NAME] -> I. Local-First Source of Truth
- [PRINCIPLE_2_NAME] -> II. Compatibility Before Deployment
- [PRINCIPLE_3_NAME] -> III. Previewed, Reversible, Non-Destructive Change
- [PRINCIPLE_4_NAME] -> IV. Deterministic Core, Advisory Agentic Layer
- [PRINCIPLE_5_NAME] -> V. Provenance, Safety, and Faithful Guidance
Added sections:
- Technical Constraints
- Development Workflow
Removed sections:
- Template comments and placeholder-only guidance
Templates requiring updates:
- updated: .specify/templates/plan-template.md reviewed; Constitution Check is generic and compatible
- updated: .specify/templates/spec-template.md reviewed; stakeholder-facing requirements remain compatible
- updated: .specify/templates/tasks-template.md reviewed; task grouping remains compatible
Follow-up TODOs: none
-->

# Quartermaster Constitution

## Core Principles

### I. Local-First Source of Truth

Quartermaster MUST keep one organized, developer-controlled library as the source of truth for
agent artifacts. The library MUST support subfolders and every supported artifact type without
forcing the developer to mirror any single harness layout. Deployment engines MUST treat the
library as read-only during deployment; writes belong in generated targets, catalog state, and
deployment records. Imported and self-authored artifacts MUST be cataloged and audited by the same
rules.

Rationale: the project exists to organize once and deploy everywhere without letting a flat target
directory or an upstream repository dictate the human library structure.

### II. Compatibility Before Deployment

Quartermaster MUST compute a compatibility verdict before deploying any artifact to any harness.
Verdicts MUST be based on declarative harness profiles, artifact type, required capabilities, and
capability dialects. Incompatible artifacts MUST be skipped with a human-readable reason, while
compatible artifacts continue through the plan. Transform-required artifacts MUST name the
transformation, such as flattening or configuration translation, before any write is applied.

Rationale: a hook, MCP server, or dialect-specific configuration that works in one harness can
silently fail in another; the tool must refuse impossible deployments instead of pretending they
will run.

### III. Previewed, Reversible, Non-Destructive Change

Quartermaster MUST present deployment plans as dry runs by default and MUST require explicit
confirmation before creating, replacing, or removing target files unless the developer chooses a
non-interactive apply mode. Applied deployments MUST record enough prior state to reverse the
target to its previous condition. Sync and deployment MUST NOT silently overwrite local
modifications, pinned artifacts, or harness edits.

Rationale: this repository manages user agent environments; mistakes can break multiple harnesses
at once. Reversibility and clear previews are mandatory, not polish.

### IV. Deterministic Core, Advisory Agentic Layer

Quartermaster MUST keep cataloging, audit, deployment planning, transformation, loadout
activation, guidance rendering, and rollback deterministic and testable. Model-driven evaluation,
grading, comparison, loadout proposal, and pipeline construction MUST remain advisory proposals
that require developer review before they affect catalog state or deployments. Provider selection
MUST stay behind a configurable gateway or router.

Rationale: language models are useful for judging natural-language artifacts, but deployment must
remain predictable and debuggable under pressure.

### V. Provenance, Safety, and Faithful Guidance

Quartermaster MUST record source provenance for every artifact and surface it before deployment.
Imports and deployments MUST run configured safety auditors when available and record normalized
findings. Managed guidance files such as CLAUDE.md and AGENTS.md MUST be generated from canonical
guidance plus accepted pipeline directives, with managed sections clearly delimited. Generated or
synthesized documentation MUST remain faithful to the source materials and MUST NOT invent
placeholder artifacts, fake results, fake metrics, or simulated command output.

Rationale: agent artifacts are executable instructions in practice. Users need to know where they
came from, what risks they carry, and which guidance was injected into each harness.

## Technical Constraints

- Runtime and implementation language: Bun with strict TypeScript.
- Catalog storage: embedded SQLite through `bun:sqlite`.
- Harness profiles: YAML data files, version-controllable and user-editable.
- Configuration dialects: support JSON, YAML, and TOML where target harnesses require them.
- Git operations: shell out to system `git`; degrade gracefully when git is absent.
- Deployment primitive: prefer symlinks on platforms where links are reliable, with copy fallback.
- Surfaces: `qm` CLI first, OpenTUI TUI, local Svelte 5 + Hono web interface, and JSON agent query
  commands with optional MCP exposure.
- Safety scanners: orchestrate external auditors such as SkillScan rather than rebuilding scanner
  logic inside the deterministic core.
- Network use: only for upstream sync, remote import, registry lookup, or explicit model calls.
- The core MUST remain local-first and usable without a remote service.

## Development Workflow

- Every feature starts from a Spec Kit `spec.md`, `plan.md`, and `tasks.md` under `specs/`.
- Plans MUST enumerate every constitution principle in the Constitution Check and mark each PASS,
  FAIL, or N/A with a concrete justification.
- Tests MUST cover deterministic catalog, profile validation, compatibility, transformation,
  deployment planning, rollback records, guidance rendering, and CLI behavior before implementation
  tasks are marked complete.
- Any filesystem operation that can overwrite, delete, replace, unlink, or roll back target state
  MUST have dry-run coverage and explicit confirmation behavior.
- Profile changes MUST be treated as data changes with schema validation and fixtures.
- Agentic evaluation outputs MUST be stored as proposals and tested as non-authoritative inputs.
- `CHANGELOG.md` MUST be updated under `[Unreleased]` for implemented features, fixes, and
  significant planning or governance changes.

## Governance

This constitution supersedes conflicting project practices for Quartermaster. Amendments require a
documented change to `.specify/memory/constitution.md`, a semantic version change, and review of
affected specs, plans, tasks, templates, and guidance files. Major version changes are required
when principles are removed or redefined incompatibly. Minor version changes are required when new
principles or governance sections are added. Patch version changes are reserved for clarifications
that do not change obligations. All implementation plans and reviews MUST verify compliance before
work proceeds.

**Version**: 1.0.0 | **Ratified**: 2026-06-26 | **Last Amended**: 2026-06-26
