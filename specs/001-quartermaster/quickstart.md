# Quickstart Validation: Quartermaster

This guide describes end-to-end validation scenarios for the feature. Commands assume the project
root is the current directory and use temporary library and target directories created by the test
harness.

## Prerequisites

- Bun is installed.
- System `git` is available for sync/import scenarios.
- Test fixtures include a mixed artifact library with skills, plugins, agents, hooks, scripts, MCP
  configs, slash commands, and output styles.
- Test fixtures include harness profiles for Claude Code, Codex, Antigravity, OpenCode, and one
  custom harness.

## Scenario 1: Catalog a Mixed Library

1. Run `qm scan --root <fixture-library> --json`.
2. Run `qm catalog --json`.
3. Verify all eight artifact types are present.
4. Verify nested organizational paths are preserved.
5. Modify one fixture artifact and rerun `qm scan --root <fixture-library> --json`.
6. Verify only that artifact is reported changed.

## Scenario 2: Audit Compatibility

1. Run `qm audit --matrix --json`.
2. Verify hook artifacts are incompatible with no-hook profiles.
3. Verify nested skills targeting flat-only harnesses are marked `transform`.
4. Verify MCP config artifacts name target format translations.
5. Verify every non-deployable verdict includes a reason.

## Scenario 3: Preview and Apply Deployment

1. Run `qm deploy preview --harness claude-code --loadout coding --json`.
2. Verify the preview lists placements, transforms, skips, provenance, and safety findings.
3. Verify target directories are unchanged after preview.
4. Run `qm deploy apply --plan <plan-id> --yes --json`.
5. Verify compatible artifacts are linked or copied to target paths.
6. Verify incompatible artifacts are skipped.
7. Run `qm deploy rollback <deployment-id> --yes --json`.
8. Verify the target returns to its prior state.

## Scenario 4: Sync Without Losing Local Edits

1. Import a git-backed artifact fixture.
2. Pin one artifact and locally modify another.
3. Advance the upstream fixture repository.
4. Run `qm sync --json`.
5. Verify unmodified artifacts update, pinned artifacts remain unchanged, and locally modified
   artifacts are reported as conflicts.

## Scenario 5: Loadout and Guidance Rendering

1. Create a coding loadout with a subset of compatible artifacts.
2. Assign the loadout to one harness.
3. Accept a pipeline proposal or create a hand-authored pipeline.
4. Run `qm guidance render --harness <id> --json`.
5. Verify the managed section includes the accepted pipeline directive.
6. Verify user-authored guidance outside managed markers is preserved.

## Scenario 6: Advisory Evaluation Does Not Auto-Apply

1. Run `qm eval compare <artifact-a> <artifact-b> --json`.
2. Verify an `EvaluationProposal` is stored with rationale and model metadata.
3. Verify no loadout, pipeline, deployment, or guidance file changed.
4. Accept or reject the proposal explicitly and verify only that explicit action changes state.

## Validation Record

- 2026-06-26: `bun run typecheck` passed.
- 2026-06-26: `bun test` passed with 15 tests, 0 failures, and 44 assertions.
- Unresolved test gaps: none recorded for the implemented task set.
