---
date: 2026-06-28
ver: 2.0.0
author: quartermaster-spec
tags: [quartermaster, agent-artifacts, cross-harness, deployment, loadouts, pipelines, agentic-evaluation, safety, mcp, compatibility]
---

# Quartermaster — Feature Specification v2.0

> A single local-first program that provisions and distributes agent artifacts across a fleet of agent harnesses. Maintains one organized source-of-truth library, keeps it current against upstreams, compiles per-harness deployments with compatibility verification, and provides loadouts, agentic evaluation, and safety auditing.

## 1. User Scenarios

### 1.1 Primary User Story

As a developer running many agent harnesses, I want to keep all of my agent artifacts in one organized library and deploy the right, compatible subset to each harness with one command, so that I organize once, stay current automatically, and never deploy something a harness cannot run.

### 1.2 Acceptance Scenarios

**Scenario 1: Organized library, flat deployment (happy path)**
- Given: The library contains skills arranged in nested category subfolders such as `research/deep-research/` and `web/frontend-design/`.
- When: The developer deploys the library to Claude Code, which discovers only direct children of its skills directory.
- Then: Quartermaster produces a flat layout in the target where each skill is a direct child, the nesting is collapsed, and every skill is discoverable, while the library's original subfolder organization is left untouched.

**Scenario 2: Incompatible artifact is refused with a reason**
- Given: The library contains a hook artifact, and the developer targets a harness whose profile declares no hook support.
- When: The developer runs the compatibility audit or a deployment for that harness.
- Then: Quartermaster marks the hook incompatible for that harness, states the reason (target does not support hooks), excludes it from the deployment plan, and still deploys every compatible artifact.

**Scenario 3: Configuration format translation**
- Given: The library contains an MCP server configuration in one canonical form.
- When: The developer deploys to two harnesses that read MCP configuration in different formats.
- Then: Quartermaster writes each harness the MCP configuration in the format that harness reads, derived from the single canonical entry, without the developer maintaining two copies.

**Scenario 4: Keeping the library current**
- Given: The library was sourced from a dozen upstream git repositories, several of which have since published updates.
- When: The developer runs a sync.
- Then: Quartermaster reports which artifacts have upstream changes, distinguishes them from artifacts the developer has locally modified, updates the unmodified ones, and flags conflicts for the modified ones rather than overwriting local work.

**Scenario 5: Safe deployment with preview and rollback (error condition)**
- Given: A deployment would overwrite or remove artifacts currently present in a harness.
- When: The developer runs the deployment.
- Then: Quartermaster shows a dry-run plan of every create, replace, and remove before touching disk, applies changes only on confirmation, records what it did, and can reverse that deployment to the prior state on request.

**Scenario 6: Self-authored artifact alongside imported**
- Given: The developer authors a new skill directly in the library inside an organizational subfolder.
- When: The developer deploys.
- Then: The self-authored skill is treated identically to imported artifacts: audited for compatibility, flattened if required, and deployed to every compatible harness.

## 2. Functional Requirements

### 2.1 Library Ingestion and Cataloging

**FR-001**: The system SHALL scan one or more configured root locations and catalog every artifact found, identifying each artifact's type among skill, plugin, agent, hook, script, MCP server configuration, slash command, and output style.
- Acceptance: Given a root containing a mix of all eight artifact types in nested subfolders, a scan produces a catalog entry for each with the correct type assigned.

**FR-002**: The system SHALL preserve and record the organizational subfolder path of each artifact in the library independently of how any harness will later require it to be laid out.
- Acceptance: An artifact at `research/deep-research/` is recorded with that organizational path; deployment to a flat-only harness does not alter the recorded library path.

**FR-003**: The system SHALL parse each artifact's metadata (for example frontmatter name and description for skills, manifest fields for plugins) and record it in the catalog.
- Acceptance: For every artifact with declared metadata, the catalog reflects its declared name, description, and version where present.

**FR-004**: The system SHALL detect and record, for each artifact, the runtime capabilities it requires (for example a plugin that bundles a hook requires hook support; an artifact referencing an MCP server requires MCP support).
- Acceptance: A plugin bundling a hook is recorded as requiring hook capability; a pure skill is recorded as requiring none beyond skill support.

**FR-005**: The system SHALL support incremental rescans that detect added, changed, and removed artifacts since the last scan without reprocessing unchanged artifacts.
- Acceptance: After a single artifact changes, a rescan reports exactly that artifact as changed and does not rewrite catalog entries for unchanged artifacts.

**FR-006**: The system SHALL allow the developer to search and filter the catalog by type, capability requirement, source, organizational path, and free text.
- Acceptance: A query for all artifacts requiring hook capability returns exactly those artifacts.

### 2.2 Source and Upstream Currency

**FR-010**: The system SHALL record, for every imported artifact, its source origin including repository or path, reference or branch, and the revision at import time.
- Acceptance: Every imported artifact has a resolvable source record; self-authored artifacts are marked as locally originated.

**FR-011**: The system SHALL import artifacts from a git repository, a subdirectory of a git repository, a marketplace entry, and a local path.
- Acceptance: Each of the four source forms imports successfully and produces correct source records.

**FR-012**: The system SHALL check configured upstreams for changes and report, per artifact, whether the upstream is unchanged, ahead, or in conflict with local modifications.
- Acceptance: For an upstream that advanced and a local artifact that was edited, the report lists the upstream as ahead and the local edit as a conflict.

**FR-013**: The system SHALL update artifacts whose upstream advanced and which have no local modifications, and SHALL NOT overwrite artifacts the developer has locally modified without explicit confirmation.
- Acceptance: A locally modified artifact is never silently overwritten by a sync; an unmodified one is updated.

**FR-014**: The system SHALL allow the developer to pin an artifact or a source to a specific revision so that sync does not advance it.
- Acceptance: A pinned artifact remains at its pinned revision across syncs until unpinned.

### 2.3 Harness Profiles

**FR-020**: The system SHALL represent each harness as a declarative profile that specifies the artifact types it supports, the capabilities it supports, the on-disk location it expects for each supported type at both global and project scope, whether each type requires a flat layout, and the configuration format it reads for each relevant type.
- Acceptance: A profile fully describes a harness such that the audit and deployment engines require no harness-specific code.

**FR-021**: The system SHALL ship built-in profiles for Claude Code, Codex, Antigravity, and OpenCode, reflecting their current conventions.
- Acceptance: Each built-in profile correctly captures that harness's skill directory, flat requirement, hook support, and MCP configuration format.

**FR-022**: The system SHALL allow the developer to define, edit, and version additional harness profiles for self-built or niche harnesses, including pi, oh-my-pi, Hermes, and ante, without modifying program code.
- Acceptance: A developer-authored profile for a custom harness participates in audit and deployment identically to a built-in profile.

**FR-023**: The system SHALL allow a harness profile to be updated when a harness changes its conventions, and SHALL treat profiles as data that can be shared and version-controlled.
- Acceptance: Editing a profile field (for example changing a skill directory path) changes subsequent deployments without a program update.

### 2.4 Compatibility Audit

**FR-030**: The system SHALL compute, for every artifact and every target harness, a compatibility verdict of deployable, deployable-after-transformation, or incompatible, by matching the artifact's required capabilities and type against the harness profile.
- Acceptance: A hook artifact against a no-hook harness yields incompatible; a skill against a skill-supporting harness yields deployable.

**FR-031**: The system SHALL attach a human-readable reason to every verdict that is not plainly deployable.
- Acceptance: Each incompatible or transform-required verdict states which capability or convention drove the result.

**FR-032**: The system SHALL identify when an artifact is deployable only after a transformation (for example flattening a nested layout, or translating a configuration format) and SHALL name the transformation required.
- Acceptance: A nested skill against a flat-only harness yields deployable-after-transformation with flatten named as the transformation.

**FR-033**: The system SHALL produce a compatibility matrix view across all artifacts and all configured harnesses.
- Acceptance: The developer can see at a glance which artifacts are safe, transformable, or blocked on each harness.

**FR-034**: The system SHALL allow the developer to record a manual override of a verdict for a specific artifact and harness, with a note, where the developer has verified behavior the heuristics cannot infer.
- Acceptance: An overridden verdict is honored by deployment and is visibly marked as a manual override.

### 2.5 Deployment and Compilation

**FR-040**: The system SHALL compile, for a chosen harness, a deployment plan listing every artifact to be placed, the target location, the method (link or copy), any transformation to be applied, and every artifact to be skipped with its reason.
- Acceptance: The plan enumerates placements, methods, transformations, and skips before any disk write.

**FR-041**: The system SHALL flatten organizational subfolders into the flat layout a target requires, such that each affected artifact becomes discoverable by that harness, while leaving the library's organization unchanged.
- Acceptance: After deployment to a flat-only harness, every previously nested artifact is discoverable by that harness and the library's nesting is intact.

**FR-042**: The system SHALL prefer linking over copying so that a single library change propagates to deployed targets without redeployment, and SHALL fall back to copying on platforms or targets where linking is unavailable or unreliable.
- Acceptance: On a link-capable platform, editing a library artifact is reflected in the linked target without redeploy; on a non-link platform, deployment still succeeds via copy.

**FR-043**: The system SHALL translate a canonical configuration artifact (for example an MCP server definition) into the specific format each target harness reads.
- Acceptance: One canonical MCP definition deploys correctly to two harnesses that read different MCP configuration formats.

**FR-044**: The system SHALL exclude incompatible artifacts from a deployment automatically and SHALL complete deployment of all compatible artifacts regardless of the presence of incompatible ones.
- Acceptance: A library containing one incompatible artifact still deploys all compatible artifacts to the target, with the incompatible one skipped and reported.

**FR-045**: The system SHALL present a deployment as a dry-run plan and SHALL apply changes to disk only after explicit confirmation, unless the developer requests non-interactive application.
- Acceptance: Default deployment shows the plan and waits; a non-interactive flag applies without prompting.

**FR-046**: The system SHALL record each applied deployment such that it can be reversed to the prior on-disk state of the target.
- Acceptance: After a deployment, a reverse operation restores the target to its pre-deployment state.

**FR-047**: The system SHALL support deploying to a single harness, to a named group of harnesses, or to all configured harnesses in one invocation.
- Acceptance: One command deploys the compatible subset to every configured harness, each in its correct layout and format.

**FR-048**: The system SHALL support scoping a deployment to a specific subset of the library (for example a profile, a tag, or an organizational subtree) rather than the whole library.
- Acceptance: Deploying a named subset places only that subset's compatible artifacts.

### 2.6 Self-Authored Artifact Management

**FR-050**: The system SHALL allow the developer to create and edit artifacts directly within the library, in any organizational subfolder, for every supported artifact type.
- Acceptance: A newly authored skill placed in a subfolder is cataloged and becomes deployable.

**FR-051**: The system SHALL treat self-authored artifacts identically to imported artifacts for audit, transformation, and deployment.
- Acceptance: A self-authored hook is audited against each harness's hook support exactly as an imported hook would be.

### 2.7 Status and Verification

**FR-060**: The system SHALL report, for any harness, which artifacts are currently deployed, by what method, and whether each deployed artifact matches its library source (in sync) or has drifted.
- Acceptance: After an out-of-band change to a deployed target, the status report flags the drift.

**FR-061**: The system SHALL detect and report orphaned deployments, meaning artifacts present in a target that no longer exist in the library.
- Acceptance: Removing an artifact from the library surfaces its prior deployments as orphaned in the next status check.

### 2.8 Trust and Provenance

**FR-070**: The system SHALL record provenance for every artifact (source, revision, import time) and SHALL surface it before deployment.
- Acceptance: The developer can see the origin and revision of any artifact about to be deployed.

**FR-071**: The system SHALL scan artifacts for risk indicators (for example bundled scripts, network access, shell execution, secret access) and SHALL flag them in the catalog and in deployment plans.
- Acceptance: An artifact that bundles an executable script is flagged before deployment so the developer can review it.

### 2.9 Composition Module (Carried from SkillFlow, Optional)

**FR-080**: The system SHALL optionally validate compositions of artifacts at design time, checking that chained artifacts have compatible inputs and outputs, that the chain is acyclic, and that modifier artifacts attach only to artifacts they can enhance, using the Noun/Verb/Adjective composability model.
- Acceptance: A composition with an output/input mismatch or a cycle is reported before any artifact runs; this module is independently disableable and does not block core deployment.

### 2.10 Loadouts and Activation

**FR-090**: The system SHALL allow the developer to define named loadouts, each being a chosen set of artifacts and pipelines, independent of any harness.
- Acceptance: A developer can create a coding loadout, a general loadout, and a business loadout, each containing a distinct membership of artifacts and pipelines.

**FR-091**: The system SHALL allow a loadout to be assigned to one or more harnesses, and SHALL allow the assignment to be changed, so that switching a harness's active loadout changes which artifacts are deployed and active on it.
- Acceptance: Assigning the coding loadout to a harness deploys exactly that loadout's compatible members and deactivates artifacts outside it; switching to the general loadout updates the harness accordingly.

**FR-092**: The system SHALL deactivate artifacts outside the active loadout on a harness rather than deleting them from the library, using the least destructive mechanism the harness supports.
- Acceptance: Deactivated artifacts are removed from the harness's active set but remain present in the library and can be reactivated by switching loadouts.

**FR-093**: The system SHALL allow loadouts to be copied and moved between harnesses, so a loadout proven on one harness can be reused on another.
- Acceptance: A loadout assigned to one harness can be applied to a second harness in one action, subject to that harness's compatibility verdicts.

**FR-094**: The system SHALL report, for any harness, its currently active loadout and the count and identity of active artifacts, so the developer can see at a glance that an agent is not overloaded.
- Acceptance: A status view shows the active loadout name and its active artifact count per harness.

### 2.11 Agentic Evaluation

**FR-100**: The system SHALL grade an artifact against named categories using a model call rather than a fixed deterministic rubric, returning per-category scores and a rationale.
- Acceptance: Grading a skill returns scores on the requested categories with a model-generated rationale, and the same skill may receive different but reasoned grades on re-evaluation, reflecting the non-deterministic nature of natural-language assessment.

**FR-101**: The system SHALL compare two or more artifacts that serve a similar purpose and return a ranked judgment of which is preferable on the requested categories, with reasons.
- Acceptance: Comparing two overlapping skills returns a ranked recommendation and a rationale identifying the trade-offs.

**FR-102**: The system SHALL support single-turn evaluation for description-level assessment and multi-turn agentic investigation for deeper assessment that reads full artifact bodies and traverses subfolders, with a developer-configurable turn budget for multi-turn runs.
- Acceptance: A single-turn grade uses only metadata and descriptions; a multi-turn investigation can open and read full skill bodies, and the developer can set the maximum number of turns it may take.

**FR-103**: The system SHALL route agentic evaluation through a developer-configured model endpoint and SHALL allow per-task model selection, so that bulk single-turn work and deep multi-turn work may use different models.
- Acceptance: The developer can configure the evaluation endpoint and assign a low-cost model to bulk grading and a higher-quality model to pipeline construction.

**FR-104**: The system SHALL treat all agentic evaluation outputs as advisory proposals that the developer reviews and explicitly accepts, edits, or rejects, and SHALL never apply them automatically.
- Acceptance: No loadout assignment, pipeline, or grade produced by the agentic layer changes the deployed state until the developer accepts it.

**FR-105**: The system SHALL propose candidate loadouts by analyzing the catalog, grouping artifacts by inferred use case, so the developer is not forced to assemble loadouts entirely by hand.
- Acceptance: Given a large catalog, the system proposes one or more named candidate loadouts with membership and rationale, which the developer may adopt or modify.

### 2.12 Pipelines

**FR-110**: The system SHALL allow the developer to define a named pipeline as an ordered or structured grouping of skills that are useful together for a stated use case.
- Acceptance: A developer can create and name a pipeline referencing two or more skills with a description of what the pipeline accomplishes.

**FR-111**: The system SHALL construct candidate pipelines agentically by sending skill descriptions, and on a multi-turn run the full skill bodies and subfolder contents, to a model that proposes pipelines, optionally guided by a developer instruction such as a target outcome.
- Acceptance: Given the catalog and an optional instruction, the system returns one or more named candidate pipelines with member skills, ordering, and rationale.

**FR-112**: The system SHALL allow a pipeline to be added to a loadout as a unit, so that activating the loadout activates the pipeline's member skills and its directive together.
- Acceptance: Adding a pipeline to a loadout includes its member skills in that loadout's deployment and its directive in the harness guidance file.

**FR-113**: The system SHALL validate a pipeline against the catalog and, when the optional composition module is enabled, against the Noun/Verb/Adjective compatibility model before it can be added to a loadout.
- Acceptance: A pipeline referencing a missing skill or an invalid composition is reported and cannot be activated until corrected.

### 2.13 Guidance File Management

**FR-120**: The system SHALL maintain a canonical guidance file in the library and SHALL translate and deploy it to each harness in that harness's required filename and form (for example CLAUDE.md for Claude Code and AGENTS.md for Codex, OpenCode, and Antigravity).
- Acceptance: One canonical guidance file deploys as CLAUDE.md to one harness and AGENTS.md to another from a single source.

**FR-121**: The system SHALL inject the directive of each active pipeline into the deployed guidance file, instructing the agent to use the pipeline's skills in sequence for the pipeline's use case rather than acting without them.
- Acceptance: When a loadout containing a pipeline is active on a harness, that harness's deployed guidance file contains the pipeline's directive in a clearly delimited managed section.

**FR-122**: The system SHALL confine its managed additions to a clearly delimited section of the guidance file so that developer-authored content outside that section is preserved across redeployments.
- Acceptance: Hand-written guidance outside the managed section survives a redeployment that updates the managed section.

### 2.14 Agent Query Interface

**FR-130**: The system SHALL expose a stable command-line query interface with machine-readable output so that an agent can interrogate the library, including listing available skills, searching by capability or use case, and retrieving an artifact's metadata.
- Acceptance: An agent invoking the query interface receives structured, parseable results for each supported query without human interaction.

**FR-131**: The system SHALL allow an agent to request an audit of one or more artifacts and to scaffold a new artifact through the query interface.
- Acceptance: An agent can request a safety audit of a skill and can request creation of a new skill stub of a given type, receiving structured results.

**FR-132**: The system MAY additionally expose the same query operations through an MCP server for harnesses that prefer MCP, with the command-line interface remaining the primary agent surface.
- Acceptance: Where enabled, an MCP client reaches the same query operations as the command-line interface.

### 2.15 Safety and Auditor Orchestration

**FR-140**: The system SHALL register external auditor tools and skills and SHALL invoke them to assess artifacts, normalizing their findings (for example a safety score and categorized issues) into the catalog.
- Acceptance: A registered scanner is invoked on an artifact and its findings are recorded against that artifact in a normalized form.

**FR-141**: The system SHALL audit newly imported and newly authored artifacts before they are eligible for deployment, and SHALL gate deployment on a developer-configurable safety threshold.
- Acceptance: An artifact scoring below the configured threshold is blocked from deployment until the developer explicitly overrides, with the override recorded.

**FR-142**: The system SHALL maintain a trusted allowlist of sources, plugins, and skills that may be exempted from repeated auditing, and SHALL be extensible to additional auditor tools without code changes to the core.
- Acceptance: An allowlisted source is skipped by routine auditing; a newly registered auditor participates without modifying the deployment engine.

## 3. Non-Functional Requirements

### 3.1 Performance

**NFR-001**: A full scan of a library of one thousand artifacts SHALL complete in under ten seconds on commodity hardware, and incremental rescans SHALL complete in under two seconds.

**NFR-002**: A compatibility audit across one thousand artifacts and ten harnesses SHALL complete in under five seconds.

**NFR-003**: Catalog search SHALL return results in under one second for a library of one thousand artifacts.

### 3.2 Reliability and Safety

**NFR-010**: Deployment SHALL be idempotent; reapplying the same plan to an unchanged target SHALL make no further changes.

**NFR-011**: No deployment SHALL modify the library; the library is read-only with respect to the deployment engine.

**NFR-012**: Every disk-mutating operation SHALL be reversible to the prior state through a recorded operation, and a failed deployment SHALL leave the target in a consistent, recoverable state rather than partially applied without record.

### 3.3 Portability

**NFR-020**: The system SHALL run on macOS as the primary platform and on Linux and Windows Subsystem for Linux, and SHALL degrade gracefully (copy instead of link) where native Windows symbolic links are unavailable without elevated privilege.

**NFR-021**: The system SHALL operate fully offline for all functions except upstream sync and remote import.

### 3.4 Privacy

**NFR-030**: The system SHALL store all catalog, configuration, and history data locally and SHALL include no telemetry, analytics, or usage reporting.

**NFR-031**: Any stored credentials (for example a git access token) SHALL be kept local and SHALL never be written into a deployment plan, log, or shared profile.

### 3.5 Extensibility

**NFR-040**: New harnesses SHALL be addable through profile data alone, with no change to program code, because harness conventions change frequently (for example a major terminal harness changed identity and conventions within a single month in 2026).

**NFR-041**: New artifact types SHALL be addable with localized changes to type definitions and profile fields, without rewriting the audit or deployment engines.

### 3.6 Usability

**NFR-050**: Every refusal to deploy SHALL be accompanied by a plain-language reason; the system SHALL never silently drop an artifact.

**NFR-051**: All core functions SHALL be operable from the command line; any graphical surface is an optional convenience layered on the same engine.

**NFR-052**: The system SHALL provide a terminal user interface and a local web interface over the same engine, both dark-mode-first, for browsing the catalog, the compatibility matrix, loadouts, and proposals.

### 3.7 Agentic Operations

**NFR-060**: Agentic evaluation SHALL be advisory only; no model-produced output SHALL change deployed state without explicit developer acceptance.

**NFR-061**: Agentic evaluation SHALL be provider-agnostic, routing through a developer-configured model endpoint, so that the system is not bound to a single vendor and can use cost-appropriate models per task. The system SHALL NOT assume a specific subscription or billing arrangement, given that programmatic agent usage is metered separately from interactive usage on some plans.

**NFR-062**: Multi-turn agentic runs SHALL respect a developer-configurable turn budget and SHALL fail closed (produce no proposal) rather than exceed it.

## 4. Key Entities

| Entity | Description | Key Attributes | Relationships |
|--------|-------------|----------------|---------------|
| Artifact | A single reusable unit of agent capability | Type, name, description, version, organizational path, required capabilities, risk flags, safety findings | Belongs to one Source; has many Compatibility Verdicts; member of many Loadouts and Pipelines |
| Source | The origin an artifact was imported from or authored in | Kind (git, subdir, marketplace, local, self), reference, imported revision, pin state, trusted flag | Provides many Artifacts |
| Harness Profile | A declarative description of one deployment target | Supported types, supported capabilities and dialects, per-type global and project paths, per-type flat requirement, per-type config format, guidance filename | Audited against all Artifacts; targeted by Deployment Plans; assigned Loadouts |
| Capability | A runtime feature an artifact may require and a harness may support, qualified by dialect | Identifier, dialect | Required by Artifacts; supported by Harness Profiles |
| Compatibility Verdict | The match result of one Artifact against one Harness Profile | Result (deployable, transform-required, incompatible), reason, named transformation, manual override flag | Links one Artifact to one Harness Profile |
| Loadout | A named, switchable activation set of artifacts and pipelines | Name, member artifacts, member pipelines | Assigned to many Harness Profiles; contains Artifacts and Pipelines |
| Pipeline | A named grouping of skills useful together, with a directive | Name, ordered member skills, use-case directive, origin (hand or agentic) | Member of Loadouts; references Artifacts; injected into Guidance Files |
| Guidance File | The canonical and per-harness memory or rule file | Canonical body, managed section, per-harness filename mapping | Deployed per Harness Profile; carries Pipeline directives |
| Auditor | A registered external scanner or safety tool | Identifier, invocation, output parser, enabled stages | Assesses Artifacts; produces safety findings |
| Evaluation Proposal | A reviewable agentic output | Kind (grade, comparison, loadout, pipeline), payload, rationale, accepted flag | Produced from Artifacts; may become a Loadout or Pipeline on acceptance |
| Deployment Plan | The computed result of compiling a loadout or the library for one harness | Placements (artifact, location, method, transformation), guidance edits, skips with reasons, scope | Targets one Harness Profile; derived from many Verdicts |
| Deployment Record | The applied, reversible history of one deployment | Applied operations, prior state reference, timestamp | Reverses one Deployment Plan application |

## 5. Success Criteria

SC-001: A developer organizes a library in human-meaningful subfolders and deploys it to a flat-only harness with every artifact discoverable, with no manual symlink authoring, in a single command.

SC-002: Across all configured harnesses, zero artifacts are ever deployed to a harness that cannot run them; every such case is reported as a skip with a reason.

SC-003: Bringing the entire library current against all upstreams is a single command that never overwrites local modifications without confirmation.

SC-004: Time to deploy the full compatible library to a new harness, starting from a written profile, is under one minute.

SC-005: Every deployment is previewable before application and reversible after it.

SC-006: Adding support for a brand-new harness requires writing one profile and no code change.

SC-007: A developer switches a harness from one loadout to another in a single command, and the harness's active artifact count drops to the loadout's membership so the agent is no longer overloaded.

SC-008: The agentic layer can propose at least one usable candidate loadout and at least one named pipeline from a large catalog, each of which the developer can accept and deploy after review.

SC-009: No artifact below the configured safety threshold reaches a harness without a recorded developer override.

SC-010: An agent can, through the command-line query interface alone, list available skills relevant to a task and request an audit, without human interaction.

## 6. Prior Art Analysis

### 6.1 Existing Solutions

| Solution | Strengths | Weaknesses | Gap This Project Fills |
|----------|-----------|------------|------------------------|
| vercel-labs/skills (`npx skills add`) | De facto cross-agent installer; 50-plus targets; symlink-based propagation; clean per-agent path contract | Handles skills only, not plugins, hooks, agents, scripts, or MCP configs; no capability auditing; no subfolder-organize-then-flatten; no canonical-to-per-harness config translation; thin multi-upstream currency | Full artifact-type coverage, capability audit with reasons, organize-and-flatten, config translation, unified upstream sync |
| xingkongliang/skills-manager | Multi-tool desktop and CLI; presets; tags; git sync; upstream update tracking | Skill-centric; no per-artifact capability audit across heterogeneous harnesses; no config-format translation; no subfolder organization model | Heterogeneous artifact types and capability-aware deployment |
| iamzhihuix/skills-manage | Local-first Tauri manager; collections; project scan; marketplace import; no telemetry | Skill-centric; no compatibility verdict engine; no hooks/MCP/agent deployment semantics | Compatibility engine and multi-type deployment |
| sickn33/antigravity-awesome-skills | Large multi-tool installable catalog; bundles | Distribution catalog, not a personal organize-audit-deploy manager; skill-centric | Personal source-of-truth management with audit and reversal |
| Anthropic plugin and marketplace tooling | First-party; validates manifests; registry distribution | Single-harness (Claude Code); validates structure, not cross-harness capability fit; flat skills directory is the very constraint being worked around | Cross-harness compilation and the flat-directory workaround |
| oh-my-openagent (omo) | Explicitly ships harness-specific editions acknowledging capability differences | Hand-maintained per-harness editions of one product, not a general engine | Generalizes the manual per-harness editioning into an automated audit and compile step |
| SkillScan and sibling scanners | Static rules plus LLM behavioral prediction plus sandbox execution; provider-agnostic; allowlists; SARIF output | Single-purpose safety tools, not library managers; no organization, deployment, or loadout concept | Orchestrating these as pluggable auditors and gating import and deployment on their findings |
| Toad and OpenTUI, Ink | Toad is a polished universal agent frontend on Textual over ACP; OpenTUI is Bun-native TypeScript TUI core; Ink is mature React TUI | Toad is a finished product, not a TUI scaffold, and is Python; not a management tool | Informs TypeScript-native TUI choice; Toad is a peer agent frontend rather than a building block |
| Headless agents | Programmatic, turn-bounded, machine-readable agent dispatch | Vendor-specific and metered separately from interactive usage on some plans | Multi-turn backend for agentic evaluation through a provider-agnostic router |

### 6.2 Patterns Adopted

Symlink-based deployment with single-source-of-truth propagation is adopted from vercel-labs/skills, because it makes a library edit visible to every linked target without redeployment and matches the flat-directory workaround that the Claude Code community already uses manually. Local-first SQLite cataloging with no telemetry is adopted from iamzhihuix/skills-manage. Declarative, version-controllable, data-only harness profiles are adopted in spirit from the way SkillNet separates a taxonomic layer from deployment, so that fast-moving harness conventions are data rather than code. Preview-and-reversible mutation with per-item rollback is adopted from the developer's own Guardian upgrade-orchestrator pattern.

### 6.3 Patterns Avoided

A cloud or SaaS catalog is avoided because the library is private and the workflow must run offline. A runtime execution engine is avoided; Quartermaster compiles and deploys artifacts and hands runtime to the harness, which keeps it from re-implementing orchestration that the harnesses already own. A single global flat library is avoided because it reproduces the exact organizational chaos the project exists to fix. Hardcoded per-harness logic is avoided in favor of profiles, because a harness changed identity and conventions within one month in 2026 and code-level coupling would not survive that pace.

## 7. Scope Boundaries

### 7.1 In Scope

- Cataloging all eight artifact types from many sources, with subfolder organization preserved.
- Unified upstream currency with local-modification protection.
- Declarative, user-extensible harness profiles for built-in and self-built harnesses.
- Per-artifact, per-harness compatibility auditing with reasons and overrides.
- Compilation and deployment with flattening, link-or-copy, config translation, incompatible-artifact exclusion, preview, and reversal.
- Named, switchable loadouts assigned to harnesses, with copy and move between harnesses.
- Agentic evaluation (grading, comparison, loadout and pipeline proposals) as an advisory, provider-agnostic, review-gated layer.
- Named pipelines, includable in loadouts and deployed as directives injected into managed guidance files.
- Canonical guidance file maintenance with per-harness translation.
- A command-line agent query interface, with an optional MCP surface over the same operations.
- Safety auditor orchestration with threshold gating and a trusted allowlist.
- Status, drift, and orphan detection; provenance and risk-flag surfacing.
- A terminal user interface and a local dark-mode-first web interface over the same engine.
- Optional composition validation carried from SkillFlow.

### 7.2 Out of Scope

- Executing artifacts or orchestrating agent runtimes; that remains the harness's job. Headless agents are dispatched only for evaluation, not as a general runtime.
- Authoring or generating artifact content beyond scaffolding and the safety-reviewed acceptance of agentic proposals.
- A hosted registry or marketplace; Quartermaster consumes sources, it does not publish a public catalog.
- Cloud sync of the library across machines beyond what the developer's own git remote provides.
- Building a bespoke safety scanner; Quartermaster orchestrates existing scanners rather than replacing them.

### 7.3 Future Considerations

- Team-shared loadouts, profiles, and library distribution.
- Composition module expansion into pipeline templates and adjective suggestion.
- A desktop packaging of the web interface over the same engine.

## 8. Assumptions and Dependencies

### 8.1 Assumptions

- The developer has local read access to every source and local write access to each target harness's artifact directories.
- Harness conventions are stable enough within a release to be captured in a profile, and unstable enough across releases to justify profiles as editable data.
- The SKILL.md and related artifact formats remain the common interchange substrate across harnesses.
- Artifacts are small text assets, so maintaining a curated copy in a single managed library imposes negligible storage cost relative to the organizational benefit.

### 8.2 Dependencies

- Git availability for upstream sync and remote import.
- Filesystem support for symbolic links on the primary platforms, with copy fallback elsewhere.
- A developer-configured, OpenAI-compatible model endpoint (for example a local gateway) for agentic evaluation, and optionally a headless agent for multi-turn investigation.
- Optional external safety scanners installed and registered for auditor orchestration.

## 9. Identified Risks

| # | Risk | Severity | Mitigation | Related Req |
|---|------|----------|-----------|-------------|
| 1 | Capability inference from artifact content is imperfect, producing wrong verdicts | High | Conservative defaults, surfaced reasons, manual override with note, provenance review | FR-030, FR-034 |
| 2 | Harness conventions change and silently break deployments | High | Profiles as editable, shareable data; built-in profiles versioned; clear failure on path mismatch | FR-020, FR-023, NFR-040 |
| 3 | Symlink flattening behaves differently or is unavailable on Windows | Medium | Copy fallback and a per-target method record | FR-042, NFR-020 |
| 4 | Sync overwrites local modifications and loses developer work | Critical | Never overwrite modified artifacts without confirmation; conflict reporting; pinning | FR-013, FR-014 |
| 5 | A risky third-party artifact is deployed unreviewed | Medium | Provenance and risk-flag scan surfaced in plans before application | FR-070, FR-071 |
| 6 | Config-format translation produces a subtly invalid target config | Medium | Validate translated output against the target format before writing; dry-run preview | FR-043, FR-045 |
| 7 | Agentic proposals are non-deterministic and may be wrong or inconsistent | Medium | Advisory only, never auto-applied; developer reviews, edits, names, and accepts; rationale surfaced | FR-104, NFR-060 |
| 8 | Headless or API agentic dispatch incurs unexpected cost or hits a separate metered quota | Medium | Provider-agnostic routing; per-task model selection; configurable turn budgets that fail closed; cheap models for bulk work | FR-103, NFR-061, NFR-062 |
| 9 | A managed guidance-file edit clobbers developer-authored content | High | Confine managed additions to a delimited section; preserve everything outside it across redeployments | FR-122 |
| 10 | A malicious skill (supply-chain attack of the kind seen in early 2026) reaches a harness | High | Auditor orchestration on import and pre-deploy; threshold gating with recorded overrides; trusted allowlist | FR-140, FR-141, FR-142 |
| 11 | Prompt injection within an artifact subverts the agentic evaluation itself | Medium | Treat evaluated content as untrusted data; constrain evaluation prompts; do not grant the evaluator write authority over deployment | FR-104, NFR-060 |
