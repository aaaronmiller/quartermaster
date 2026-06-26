# Tasks: Quartermaster

**Input**: Design documents from `specs/001-quartermaster/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`,
`quickstart.md`

## Phase 1: Setup

- [X] T001 Create Bun TypeScript project manifest in `package.json`
- [X] T002 Add strict TypeScript configuration in `tsconfig.json`
- [X] T003 Create source directory structure under `src/cli`, `src/core`, `src/profiles`, `src/storage`, `src/tui`, `src/web`, and `src/query`
- [X] T004 Create test fixture directories under `tests/fixtures/library` and `tests/fixtures/targets`
- [X] T005 Add Bun test script and CLI entry script definitions in `package.json`
- [X] T006 Create initial changelog with `[Unreleased]` section in `CHANGELOG.md`

## Phase 2: Foundational

- [X] T007 Define shared domain types for Source, Artifact, HarnessProfile, CompatibilityVerdict, DeploymentPlan, DeploymentRecord, Loadout, Pipeline, GuidanceFile, Auditor, AuditFinding, and EvaluationProposal in `src/core/types.ts`
- [X] T008 Implement SQLite schema creation and migrations for catalog tables in `src/storage/schema.ts`
- [X] T009 Implement repository functions for persisted entities in `src/storage/repository.ts`
- [X] T010 Implement filesystem path safety utilities for configured library roots and target roots in `src/core/filesystem/paths.ts`
- [X] T011 Implement JSON output helpers and error formatting for CLI commands in `src/cli/output.ts`
- [X] T012 [P] Add built-in harness profile fixtures for Claude Code, Codex, Antigravity, and OpenCode in `src/profiles/builtin/`
- [X] T013 [P] Add profile schema validation tests in `tests/unit/profile-schema.test.ts`
- [X] T014 Implement profile registry loading for built-in and user YAML profiles in `src/core/audit/profile-registry.ts`

## Phase 3: User Story 1 - Catalog One Organized Library (P1)

**Goal**: Scan one organized source library and query all supported artifact types.

**Independent Test**: A fixture library containing all eight artifact types scans into the catalog
with correct type, metadata, source, path, capability, and risk data.

- [X] T015 [P] [US1] Create mixed artifact fixtures in `tests/fixtures/library/mixed/`
- [X] T016 [P] [US1] Implement artifact type detectors in `src/core/catalog/detectors.ts`
- [X] T017 [P] [US1] Implement metadata parsers for SKILL frontmatter, manifests, scripts, MCP configs, commands, and output styles in `src/core/catalog/metadata.ts`
- [X] T018 [US1] Implement capability and risk inference in `src/core/catalog/inference.ts`
- [X] T019 [US1] Implement catalog scan and incremental rescan service in `src/core/catalog/scanner.ts`
- [X] T020 [US1] Implement `qm scan` command in `src/cli/commands/scan.ts`
- [X] T021 [US1] Implement `qm catalog` list/show filters in `src/cli/commands/catalog.ts`
- [X] T022 [P] [US1] Add catalog unit tests in `tests/unit/catalog.test.ts`
- [X] T023 [US1] Add catalog integration test for incremental rescan in `tests/integration/scan.test.ts`

## Phase 4: User Story 2 - Audit Harness Compatibility Before Deployment (P1)

**Goal**: Produce compatibility verdicts from artifact data and harness profiles before deployment.

**Independent Test**: A compatibility matrix reports deployable, transform-required, and
incompatible verdicts with reasons for all fixture artifacts and profiles.

- [X] T024 [P] [US2] Implement capability and dialect matching in `src/core/audit/capabilities.ts`
- [X] T025 [P] [US2] Implement layout and config-format transform detection in `src/core/audit/transforms.ts`
- [X] T026 [US2] Implement compatibility verdict computation in `src/core/audit/auditor.ts`
- [X] T027 [US2] Implement manual override persistence and visibility in `src/core/audit/overrides.ts`
- [X] T028 [US2] Implement `qm audit` and matrix JSON output in `src/cli/commands/audit.ts`
- [X] T029 [P] [US2] Add contract tests for profile-to-verdict behavior in `tests/contract/audit-contract.test.ts`
- [X] T030 [US2] Add integration test for hook refusal, flat transform, and MCP translation verdicts in `tests/integration/audit.test.ts`

## Phase 5: User Story 3 - Preview and Apply Reversible Deployments (P1)

**Goal**: Generate dry-run deployment plans, apply compatible changes, and roll them back.

**Independent Test**: Preview writes nothing, apply records prior state, incompatible artifacts are
skipped, and rollback restores target state.

- [X] T031 [P] [US3] Implement deployment plan operation model in `src/core/deploy/plan.ts`
- [X] T032 [P] [US3] Implement flattening and target-name conflict detection in `src/core/deploy/flatten.ts`
- [X] T033 [P] [US3] Implement config translation writer for JSON, YAML, and TOML targets in `src/core/deploy/config-writer.ts`
- [X] T034 [US3] Implement symlink-or-copy placement with platform fallback in `src/core/deploy/placer.ts`
- [X] T035 [US3] Implement prior-state capture and deployment record persistence in `src/core/deploy/records.ts`
- [X] T036 [US3] Implement rollback planning and apply in `src/core/deploy/rollback.ts`
- [X] T037 [US3] Implement `qm deploy preview`, `qm deploy apply`, and `qm deploy rollback` in `src/cli/commands/deploy.ts`
- [X] T038 [P] [US3] Add deployment dry-run and confirmation tests in `tests/integration/deploy-preview.test.ts`
- [X] T039 [US3] Add rollback integration test in `tests/integration/deploy-rollback.test.ts`

## Phase 6: User Story 4 - Manage Loadouts, Pipelines, and Guidance (P2)

**Goal**: Activate curated artifact subsets and render managed guidance sections.

**Independent Test**: Assigning a loadout changes active deployments and guidance rendering while
preserving user-authored guidance outside managed markers.

- [X] T040 [P] [US4] Implement loadout membership and assignment services in `src/core/loadouts/loadouts.ts`
- [X] T041 [P] [US4] Implement pipeline storage and ordering in `src/core/loadouts/pipelines.ts`
- [X] T042 [US4] Implement loadout-aware deployment scoping in `src/core/deploy/scope.ts`
- [X] T043 [US4] Implement guidance renderer with managed markers in `src/core/guidance/render.ts`
- [X] T044 [US4] Implement `qm loadout` and `qm guidance` commands in `src/cli/commands/loadout.ts` and `src/cli/commands/guidance.ts`
- [X] T045 [P] [US4] Add guidance preservation tests in `tests/unit/guidance.test.ts`
- [X] T046 [US4] Add loadout assignment integration test in `tests/integration/loadouts.test.ts`

## Phase 7: User Story 5 - Keep Imported Artifacts Current and Safe (P2)

**Goal**: Track provenance, sync upstreams without losing local edits, and surface safety findings.

**Independent Test**: Sync updates unmodified artifacts, preserves pinned/local modifications, and
safety findings appear in catalog and deployment views.

- [X] T047 [P] [US5] Implement source import handlers for git, git subdirectory, marketplace, local path, and self-authored artifacts in `src/core/catalog/importers.ts`
- [X] T048 [P] [US5] Implement system git wrapper and graceful capability errors in `src/core/catalog/git.ts`
- [X] T049 [US5] Implement upstream status, pin, and local modification detection in `src/core/catalog/sync.ts`
- [X] T050 [US5] Implement auditor registration and subprocess orchestration in `src/core/safety/auditors.ts`
- [X] T051 [US5] Implement normalized audit finding persistence in `src/core/safety/findings.ts`
- [X] T052 [US5] Implement `qm import` and `qm sync` commands in `src/cli/commands/import.ts` and `src/cli/commands/sync.ts`
- [X] T053 [P] [US5] Add git fixture sync tests in `tests/integration/sync.test.ts`
- [X] T054 [US5] Add safety auditor parser tests in `tests/unit/safety.test.ts`

## Phase 8: User Story 6 - Use Advisory Agentic Evaluation (P3)

**Goal**: Create reviewable model-driven proposals that do not mutate deterministic state unless
explicitly accepted.

**Independent Test**: Evaluation creates proposals with rationale and model metadata; loadouts,
pipelines, deployments, and guidance remain unchanged until explicit accept/edit/reject commands.

- [X] T055 [P] [US6] Implement provider-agnostic model gateway client interface in `src/core/evaluation/gateway.ts`
- [X] T056 [P] [US6] Implement proposal persistence and acceptance state in `src/core/evaluation/proposals.ts`
- [X] T057 [US6] Implement grade, compare, propose-loadout, and propose-pipeline workflows in `src/core/evaluation/workflows.ts`
- [X] T058 [US6] Implement `qm eval` commands in `src/cli/commands/eval.ts`
- [X] T059 [P] [US6] Add tests proving proposal creation has no deployment side effects in `tests/unit/evaluation.test.ts`
- [X] T060 [US6] Add proposal accept/edit/reject integration test in `tests/integration/evaluation-proposals.test.ts`

## Phase 9: Agent Query, TUI, and Web Surfaces

- [X] T061 [P] Implement stable JSON agent query commands in `src/query/commands.ts`
- [X] T062 [P] Implement OpenTUI shell over catalog, audit, deploy, loadout, and status views in `src/tui/app.ts`
- [X] T063 [P] Implement local Hono API routes for catalog, audit, deploy preview, loadouts, and guidance in `src/web/server/routes.ts`
- [X] T064 [P] Implement Svelte web views for catalog, compatibility matrix, deployment preview, loadouts, and proposal review in `src/web/app/`
- [X] T065 Add contract tests for `qm query` JSON stability in `tests/contract/agent-query-contract.test.ts`

## Phase 10: Polish & Cross-Cutting

- [X] T066 Add status and orphan detection command in `src/cli/commands/status.ts`
- [X] T067 Add end-to-end quickstart validation tests matching `specs/001-quartermaster/quickstart.md` in `tests/integration/quickstart.test.ts`
- [X] T068 Add CLI help text and command examples in `README.md`
- [X] T069 Update `CHANGELOG.md` with implemented Quartermaster functionality under `[Unreleased]`
- [X] T070 Run `bun test` and record any unresolved test gaps in `specs/001-quartermaster/quickstart.md`

## Dependencies

- Phase 1 and Phase 2 must complete before user stories.
- US1 is required before US2, US3, US4, US5, and US6 because all later work depends on cataloged
  artifacts.
- US2 is required before US3 and US4 because deployment and loadout activation depend on
  compatibility verdicts.
- US3 can ship as the MVP once US1 and US2 are complete.
- US4 and US5 can proceed after US3's plan/apply core exists.
- US6 can proceed after the catalog and loadout data model are stable.
- Agent query, TUI, and web surfaces depend on the shared core workflows they expose.

## Parallel Execution Examples

- After T007-T014, T016, T017, T022, and fixture work in T015 can run in parallel.
- During US2, T024 and T025 can run in parallel before T026 combines them.
- During US3, T031, T032, and T033 can run in parallel before placement and rollback work.
- During US4, loadout service and pipeline service tasks can run in parallel.
- During US5, import handlers, git wrapper, and auditor parser tests can run in parallel.
- During US6, gateway interface and proposal persistence can run in parallel.

## Implementation Strategy

1. Deliver MVP: scan catalog, audit compatibility, preview/apply/rollback deployment from CLI.
2. Add loadouts and guidance once deployment is stable.
3. Add source sync and safety scanning.
4. Add advisory evaluation.
5. Add query, TUI, and web surfaces over the stable core.
