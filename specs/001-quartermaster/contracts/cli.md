# CLI Contract: `qm`

The CLI is the primary automation surface. Human output may be formatted, but every command that
agents need to consume must support `--json`.

## `qm scan`

Purpose: scan configured library roots and update the catalog.

Required behavior:

- `qm scan --root <path>` scans one root.
- `qm scan --all` scans configured roots.
- `qm scan --json` returns added, changed, removed, unchanged, and error counts.
- Incremental scans reuse `content_hash` and do not rewrite unchanged artifacts.

## `qm catalog`

Purpose: query cataloged artifacts.

Required behavior:

- Filter by `--type`, `--capability`, `--source`, `--path`, and free text.
- `qm catalog show <artifact-id> --json` returns artifact metadata, provenance, risk flags, and
  deployment status summary.

## `qm import`

Purpose: add artifacts from external or local sources.

Required behavior:

- Accept git repository, git subdirectory, marketplace entry, and local path sources.
- Record source provenance before artifacts become deployable.
- Run enabled safety auditors unless `--skip-audit` is explicitly supplied.

## `qm sync`

Purpose: check and update upstream sources.

Required behavior:

- Default mode reports upstream status without overwriting local modifications.
- Pinned artifacts or sources are reported and left unchanged.
- Conflicts require explicit confirmation before resolution.

## `qm audit`

Purpose: compute compatibility verdicts.

Required behavior:

- `qm audit --harness <id>` audits one target.
- `qm audit --matrix --json` returns artifact-by-harness verdicts.
- Every `transform` or `incompatible` verdict includes a reason.
- Manual overrides are visible in output.

## `qm deploy preview`

Purpose: produce a deployment plan without filesystem writes.

Required behavior:

- Accept `--harness`, `--group`, or `--all`.
- Accept scope by `--loadout`, `--tag`, `--profile`, or `--path`.
- Output create, replace, remove, link, copy, transform, write_config, and skip operations.
- Surface provenance and safety findings for every artifact in scope.

## `qm deploy apply`

Purpose: apply a reviewed deployment plan.

Required behavior:

- Requires a plan id or reproducible preview arguments.
- Requires explicit confirmation unless `--yes` is supplied.
- Records operations and prior state for rollback.
- Does not deploy incompatible artifacts.

## `qm deploy rollback`

Purpose: reverse a previous deployment.

Required behavior:

- Accept deployment id.
- Preview rollback operations before applying.
- Restore captured prior state where available.

## `qm loadout`

Purpose: manage named activation sets.

Required behavior:

- Create, list, show, edit membership, assign to harness, and copy assignment.
- Assignment affects activation/deployment, not library membership.

## `qm guidance`

Purpose: render and inspect managed guidance files.

Required behavior:

- Render canonical guidance plus accepted pipeline directives for a harness.
- Preserve user-authored content outside managed markers.
- Show diff before writing guidance targets.

## `qm eval`

Purpose: create advisory model-driven proposals.

Required behavior:

- Support grade, compare, propose-loadout, and propose-pipeline modes.
- Store proposal payload, rationale, model, and turn budget.
- Require separate accept/edit/reject command before proposal affects loadouts or pipelines.
