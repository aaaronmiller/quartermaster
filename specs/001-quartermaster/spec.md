# Feature Specification: Quartermaster

**Feature Branch**: `001-quartermaster`
**Created**: 2026-06-26
**Status**: Draft
**Input**: User description from `requirements.md`

## User Scenarios & Testing

### User Story 1 - Catalog One Organized Library (Priority: P1)

As a developer with many imported and self-authored agent artifacts, I want Quartermaster to scan
one organized library with subfolders and mixed artifact types, so that I can search and reason
about everything from one source of truth.

**Why this priority**: The catalog is the foundation for compatibility, deployment, loadouts,
safety, and provenance.

**Independent Test**: Given a library containing skills, plugins, agents, hooks, scripts, MCP
configs, slash commands, and output styles in nested folders, a scan records each artifact with
the correct type, metadata, organizational path, source, required capabilities, and risk flags.

**Acceptance Scenarios**:

1. **Given** a nested skill at `research/deep-research/`, **When** the library is scanned, **Then**
   the catalog records its organizational path without flattening the library.
2. **Given** a plugin that bundles a hook, **When** the library is scanned, **Then** the catalog
   records both the plugin type and its hook capability requirement.
3. **Given** a single changed artifact after a completed scan, **When** an incremental rescan runs,
   **Then** only that artifact is reported as changed and unchanged catalog records are retained.

---

### User Story 2 - Audit Harness Compatibility Before Deployment (Priority: P1)

As a developer targeting Claude Code, Codex, Antigravity, OpenCode, and custom harnesses, I want a
per-artifact compatibility verdict for each harness, so that unsupported artifacts are refused
with clear reasons before anything touches disk.

**Why this priority**: Safe deployment depends on knowing which harness can actually run each
artifact and which transformations are required.

**Independent Test**: Given declarative harness profiles and a mixed catalog, the audit produces a
matrix of deployable, transform-required, and incompatible verdicts with explanations.

**Acceptance Scenarios**:

1. **Given** a hook artifact and a profile with no hook support, **When** compatibility is audited,
   **Then** the hook is marked incompatible with the reason "target does not support hooks".
2. **Given** a nested skill and a flat-only target profile, **When** compatibility is audited,
   **Then** the verdict is transform-required and names flattening as the transformation.
3. **Given** an MCP config and two targets with different config dialects, **When** compatibility
   is audited, **Then** each target verdict names the dialect translation required.

---

### User Story 3 - Preview and Apply Reversible Deployments (Priority: P1)

As a developer deploying artifacts into live harness directories, I want a dry-run deployment plan
and reversible application, so that Quartermaster never silently overwrites or removes target
state.

**Why this priority**: Deployment is the riskiest workflow because it can break multiple agent
environments at once.

**Independent Test**: Given cataloged artifacts, compatibility verdicts, and a target harness, a
deployment preview lists every create, replace, remove, transform, skip, and rollback record before
an explicit apply writes to disk.

**Acceptance Scenarios**:

1. **Given** a target directory with existing artifacts, **When** deployment is requested, **Then**
   Quartermaster shows a dry-run plan before changing files.
2. **Given** a deployment that replaces a target file, **When** the deployment is applied, **Then**
   the previous state is captured and a rollback restores it.
3. **Given** one incompatible artifact among compatible artifacts, **When** deployment is applied,
   **Then** the incompatible artifact is skipped and compatible artifacts are still deployed.

---

### User Story 4 - Manage Loadouts, Pipelines, and Guidance (Priority: P2)

As a developer with too many available artifacts, I want named loadouts and skill pipelines that
inject directives into harness guidance files, so that each harness activates a curated subset for
its current purpose.

**Why this priority**: Once catalog and deployment work, activation control prevents agents from
being overloaded by every artifact at once.

**Independent Test**: Given multiple loadouts and pipelines, assigning a loadout to a harness
changes the active deployable set and renders the matching managed guidance section.

**Acceptance Scenarios**:

1. **Given** coding, general, and business loadouts, **When** the coding loadout is assigned to a
   harness, **Then** only compatible coding members and accepted pipelines are activated there.
2. **Given** a pipeline accepted by the developer, **When** guidance is rendered, **Then** its
   directive appears inside a clearly delimited managed section.
3. **Given** artifacts outside the active loadout, **When** the harness is deployed, **Then** those
   artifacts are deactivated by the least destructive mechanism and remain in the library.

---

### User Story 5 - Keep Imported Artifacts Current and Safe (Priority: P2)

As a developer importing from git repositories, marketplaces, and local paths, I want provenance,
upstream sync, pinning, and safety audits, so that third-party artifacts can be updated without
losing local edits or hiding risk.

**Why this priority**: A useful library will include many upstream sources, and supply-chain risk
must be visible before import or deployment.

**Independent Test**: Given imported artifacts with source records, Quartermaster reports upstream
status, respects pins and local modifications, runs configured auditors, and surfaces findings in
catalog and deployment views.

**Acceptance Scenarios**:

1. **Given** an imported artifact whose upstream has advanced and no local edit exists, **When**
   sync runs, **Then** the artifact is updated and provenance is refreshed.
2. **Given** an imported artifact with local modifications, **When** sync runs, **Then** the
   artifact is reported as a conflict and is not overwritten without explicit confirmation.
3. **Given** an artifact with bundled executable scripts, **When** safety audit runs, **Then** the
   catalog and deployment plan flag the risk for review.

---

### User Story 6 - Use Advisory Agentic Evaluation (Priority: P3)

As a developer curating natural-language skills, I want model-driven grading, comparison, loadout
proposal, and pipeline construction that never auto-applies, so that the system can help organize
large libraries while I retain final control.

**Why this priority**: Agentic evaluation is valuable but must not block or destabilize the
deterministic deployment core.

**Independent Test**: Given artifact contents and a configured model gateway, the evaluation layer
creates reviewable proposals with rationale, model, and turn budget metadata; accepting a proposal
is a separate developer action.

**Acceptance Scenarios**:

1. **Given** two skills with overlapping purpose, **When** comparison is requested, **Then** a
   proposal records the verdict, rationale, model, and timestamp without changing loadouts.
2. **Given** a use case and a catalog, **When** pipeline construction is requested, **Then** the
   proposed pipeline remains inactive until accepted, edited, named, or rejected.

### Edge Cases

- Harness profiles can change after artifacts were previously deployed; status must detect drift
  and future audits must use the current profile data.
- Two artifacts can flatten to the same target name; deployment planning must surface the conflict
  and block the write until resolved.
- A target platform can reject symlinks; deployment must fall back to copy when the profile and
  platform permit it.
- Git may be unavailable or offline; local catalog, audit, and deployment must still work while
  sync/import reports a clear capability limitation.
- External auditors or model providers can fail; deterministic workflows must continue where safe
  and record the missing advisory result.
- Managed guidance files may contain user-authored content outside managed markers; rendering must
  preserve user content.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST scan one or more configured root locations and catalog skills,
  plugins, agents, hooks, scripts, MCP server configurations, slash commands, and output styles.
- **FR-002**: The system MUST preserve each artifact's organizational subfolder path independently
  from any target harness layout.
- **FR-003**: The system MUST parse available artifact metadata, including name, description, and
  version when present.
- **FR-004**: The system MUST infer and record required runtime capabilities and dialects for each
  artifact.
- **FR-005**: The system MUST support incremental rescans that identify added, changed, and removed
  artifacts without reprocessing unchanged artifacts.
- **FR-006**: The system MUST provide catalog search and filtering by type, capability, source,
  organizational path, and free text.
- **FR-010**: The system MUST record source provenance for imported and self-authored artifacts,
  including origin, reference or branch, revision when available, and import time.
- **FR-011**: The system MUST import artifacts from git repositories, git subdirectories,
  marketplaces, and local paths.
- **FR-012**: The system MUST report upstream status as unchanged, ahead, pinned, locally modified,
  or conflicted.
- **FR-013**: The system MUST update unmodified artifacts whose upstream advanced and MUST NOT
  silently overwrite locally modified artifacts.
- **FR-014**: The system MUST allow artifacts or sources to be pinned to a specific revision.
- **FR-020**: The system MUST represent harnesses as declarative profiles with supported artifact
  types, capabilities, dialects, target paths, layout requirements, and config formats.
- **FR-021**: The system MUST ship profiles for Claude Code, Codex, Antigravity, and OpenCode.
- **FR-022**: The system MUST allow user-defined profiles for pi, oh-my-pi, Hermes, ante, and
  other harnesses without code changes.
- **FR-030**: The system MUST compute compatibility verdicts for every artifact and target harness.
- **FR-031**: The system MUST attach human-readable reasons to incompatible or transform-required
  verdicts.
- **FR-040**: The system MUST compile a deployment plan listing placements, methods,
  transformations, skips, and reasons.
- **FR-041**: The system MUST flatten nested organizational paths only in targets that require flat
  discovery, leaving the library untouched.
- **FR-042**: The system MUST prefer symlinks and fall back to copies when links are unavailable or
  unreliable.
- **FR-043**: The system MUST translate canonical configuration artifacts into target-specific JSON,
  YAML, or TOML formats.
- **FR-045**: The system MUST dry-run deployments by default and apply only after explicit
  confirmation unless non-interactive apply is requested.
- **FR-046**: The system MUST record applied deployments so they can be reversed.
- **FR-047**: The system MUST deploy to a single harness, a named harness group, or all configured
  harnesses.
- **FR-048**: The system MUST scope deployment to a loadout, tag, profile, or organizational
  subtree.
- **FR-050**: The system MUST support self-authored artifacts in any supported type and subfolder.
- **FR-060**: The system MUST report deployed artifact status, method, and drift per harness.
- **FR-061**: The system MUST detect orphaned deployments.
- **FR-070**: The system MUST surface provenance before deployment.
- **FR-071**: The system MUST orchestrate configured safety auditors and store normalized findings.
- **FR-080**: The system SHOULD optionally validate Noun/Verb/Adjective artifact compositions.
- **FR-090**: The system MUST define named loadouts containing artifacts and pipelines.
- **FR-091**: The system MUST assign loadouts to one or more harnesses and change assignments.
- **FR-092**: The system MUST deactivate artifacts outside an active loadout using the least
  destructive supported mechanism.
- **FR-093**: The system MUST copy or move loadout assignments between harnesses subject to
  compatibility verdicts.
- **FR-100**: The system MUST keep deterministic workflows separate from advisory model-driven
  proposals.
- **FR-101**: The system MUST maintain managed guidance sections without overwriting user-authored
  guidance outside managed markers.

### Key Entities

- **Artifact**: A reusable unit of agent capability with type, name, metadata, organizational path,
  required capabilities, risk flags, provenance, and source relationship.
- **Source**: A git repository, git subdirectory, marketplace entry, local path, or self-authored
  origin that can be checked for currency and pinned.
- **HarnessProfile**: A declarative target description that defines supported artifact types,
  capabilities, dialects, target paths, layout rules, and configuration formats.
- **CompatibilityVerdict**: The per-artifact, per-harness result with deployable,
  transform-required, or incompatible status and reason.
- **DeploymentPlan**: A previewable set of placement, transformation, skip, and rollback operations.
- **DeploymentRecord**: A persisted applied plan and prior-state references used for status and
  rollback.
- **Loadout**: A named activation set containing artifacts and pipelines.
- **Pipeline**: An ordered or structured grouping of skills with an injected guidance directive.
- **GuidanceFile**: Canonical or per-harness guidance body with user-authored and managed sections.
- **Auditor**: An external scanner definition with invocation, stages, parser, and enabled state.
- **EvaluationProposal**: A model-produced advisory result for grade, comparison, loadout, or
  pipeline that requires developer acceptance before use.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A mixed library with all eight artifact types can be scanned and searched from the
  CLI with correct type and path metadata for every valid artifact.
- **SC-002**: Compatibility audit produces a matrix for all configured harnesses and includes a
  reason for every incompatible or transform-required verdict.
- **SC-003**: Default deployment produces a dry-run plan and performs no filesystem writes until
  confirmation is supplied.
- **SC-004**: A completed deployment can be rolled back to the previous target state in validation
  scenarios.
- **SC-005**: Loadout assignment changes which artifacts are active for a harness without deleting
  the underlying library artifacts.
- **SC-006**: Upstream sync never silently overwrites a locally modified or pinned artifact.
- **SC-007**: Managed guidance rendering preserves user-authored content outside managed markers.
- **SC-008**: Agentic evaluation proposals can be created, inspected, accepted, edited, or rejected
  without automatic deployment side effects.

## Assumptions

- The initial implementation targets a local developer workstation and does not provide a hosted
  registry or remote service.
- The CLI is the first complete surface; TUI, web, and optional MCP surfaces sit over the same
  domain core.
- System `git` is available for remote import and sync workflows, but catalog, audit, and
  deployment degrade gracefully when it is missing.
- Built-in harness profiles can be updated as data files when harness conventions change.
- Safety auditors and model providers are optional external dependencies; deterministic core
  workflows remain usable without them.
