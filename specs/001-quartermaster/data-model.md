# Data Model: Quartermaster

## Entity: Source

Represents the origin of an artifact.

Fields:

- `id`: stable source identifier
- `kind`: `git`, `git_subdir`, `marketplace`, `local`, or `self`
- `reference`: repository URL, path, marketplace identifier, or local path
- `ref_branch`: branch or reference name when applicable
- `imported_revision`: revision captured at import time when available
- `pin_revision`: optional revision that prevents sync advancement
- `updated_at`: timestamp of last source state update

Relationships:

- One Source has many Artifacts.

Validation:

- `kind` must be one of the supported source kinds.
- `pin_revision` can be set only when the source can resolve revisions.

## Entity: Artifact

Represents one reusable unit of agent capability.

Fields:

- `id`: stable artifact identifier
- `type`: `skill`, `plugin`, `agent`, `hook`, `script`, `mcp`, `command`, or `output_style`
- `name`: display name
- `description`: optional summary
- `version`: optional artifact version
- `org_path`: library-relative organizational path
- `abs_path`: absolute source-library path
- `content_hash`: content hash for incremental scan and local modification checks
- `required_capabilities`: structured list of capability and dialect requirements
- `risk_flags`: structured list of detected risks
- `source_id`: Source relationship
- `is_self_authored`: boolean
- `locally_modified`: boolean
- `updated_at`: timestamp

Relationships:

- Belongs to Source.
- Has many CompatibilityVerdicts.
- Can be a member of Loadouts and Pipelines.
- Has many AuditFindings.

Validation:

- `org_path` must be unique within the active library root unless an explicit conflict record is
  created.
- `type` must be one of the supported artifact types.
- `abs_path` must stay inside a configured source-library root.

## Entity: HarnessProfile

Represents a declarative harness target loaded from YAML.

Fields:

- `id`: stable profile identifier
- `name`: display name
- `supported_artifact_types`: supported artifact types
- `capabilities`: supported capabilities and dialects
- `targets`: global and project-scope filesystem locations per artifact type
- `layout`: flat or nested requirements per artifact type
- `config_formats`: supported configuration formats per capability
- `deactivation`: least-destructive deactivation strategy

Relationships:

- Produces CompatibilityVerdicts with Artifacts.
- Receives LoadoutAssignments and Deployments.

Validation:

- Every supported artifact type must declare at least one target location or an explicit reason it
  is virtual/config-only.
- Capability dialects must be named when dialect affects compatibility.

## Entity: CompatibilityVerdict

Represents whether an artifact can be deployed to a harness.

Fields:

- `artifact_id`
- `harness_id`
- `result`: `deployable`, `transform`, or `incompatible`
- `reason`: required when result is not plainly deployable
- `transformation`: optional transform name such as `flatten` or `translate:mcp`
- `override_note`: optional developer override explanation
- `computed_at`: timestamp

Validation:

- `reason` is required for `transform` and `incompatible`.
- `override_note` must be visible in deployment plans.

## Entity: DeploymentPlan

Represents a previewable deployment.

Fields:

- `id`
- `harness_id`
- `scope`: all, loadout, tag, profile, or organizational subtree
- `placements`: planned create, replace, remove, write_config, transform, and skip operations
- `requires_confirmation`: boolean
- `created_at`

Validation:

- Plans must include skips and reasons for incompatible artifacts.
- Plans that contain replace or remove operations must require confirmation unless explicitly
  requested as non-interactive apply.

## Entity: DeploymentRecord

Represents an applied deployment and rollback data.

Fields:

- `id`
- `harness_id`
- `scope`
- `plan_snapshot`
- `applied_at`
- `operations`: ordered create, replace, remove, link, copy, write_config operations
- `prior_state_ref`: prior target content or metadata reference when needed for rollback

Validation:

- Every reversible operation must have either a prior state reference or an explicit "no prior
  state" marker.

## Entity: Loadout

Represents a named activation set.

Fields:

- `id`
- `name`
- `description`
- `members`: artifacts and pipelines
- `updated_at`

Relationships:

- Has many LoadoutAssignments.
- Contains many Artifact and Pipeline members.

Validation:

- Loadout names must be unique.
- Members must exist in the catalog before assignment can deploy them.

## Entity: Pipeline

Represents an ordered or structured group of skills with a guidance directive.

Fields:

- `id`
- `name`
- `use_case`
- `directive`
- `origin`: `hand` or `agentic`
- `members`: ordered artifacts
- `updated_at`

Validation:

- Agentic-origin pipelines must trace to an accepted EvaluationProposal.

## Entity: GuidanceFile

Represents canonical or per-harness guidance content.

Fields:

- `id`
- `scope`: `canonical` or `harness`
- `harness_id`
- `body`: user-authored body
- `managed_section`: generated pipeline/loadout directives
- `updated_at`

Validation:

- Rendering must preserve user-authored body outside managed markers.
- Managed markers must be deterministic and detectable.

## Entity: Auditor

Represents an external safety scanner.

Fields:

- `id`
- `invocation`
- `stages`
- `parser`
- `enabled`

Validation:

- Disabled auditors are skipped and reported as skipped, not failed.

## Entity: AuditFinding

Represents normalized scanner output for an artifact.

Fields:

- `artifact_id`
- `auditor_id`
- `score`
- `severity`: `info`, `low`, `medium`, `high`, or `critical`
- `findings`: structured details
- `evaluated_at`

Validation:

- Severity values must use the normalized enum regardless of scanner-native labels.

## Entity: EvaluationProposal

Represents model-driven advisory output.

Fields:

- `id`
- `kind`: `grade`, `comparison`, `loadout`, or `pipeline`
- `payload`
- `rationale`
- `model`
- `turns`
- `accepted`
- `created_at`

Validation:

- Proposal creation must not modify loadouts, pipelines, deployments, or guidance.
- Accepted proposals must retain original payload and rationale for auditability.
