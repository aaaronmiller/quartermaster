<!-- SPECKIT START -->
Current Spec Kit plan: `specs/001-quartermaster/plan.md`

Before running any `/speckit.*` command, filling or editing a `plan.md`
Constitution Check, or marking any task complete, read
`.specify/memory/constitution.md` in full.
<!-- SPECKIT END -->

## Constitution

Authoritative principles copied verbatim from `.specify/memory/constitution.md`:

### I. Local-First Source of Truth

Quartermaster MUST keep one organized, developer-controlled library as the source of truth for
agent artifacts. The library MUST support subfolders and every supported artifact type without
forcing the developer to mirror any single harness layout. Deployment engines MUST treat the
library as read-only during deployment; writes belong in generated targets, catalog state, and
deployment records. Imported and self-authored artifacts MUST be cataloged and audited by the same
rules.

### II. Compatibility Before Deployment

Quartermaster MUST compute a compatibility verdict before deploying any artifact to any harness.
Verdicts MUST be based on declarative harness profiles, artifact type, required capabilities, and
capability dialects. Incompatible artifacts MUST be skipped with a human-readable reason, while
compatible artifacts continue through the plan. Transform-required artifacts MUST name the
transformation, such as flattening or configuration translation, before any write is applied.

### III. Previewed, Reversible, Non-Destructive Change

Quartermaster MUST present deployment plans as dry runs by default and MUST require explicit
confirmation before creating, replacing, or removing target files unless the developer chooses a
non-interactive apply mode. Applied deployments MUST record enough prior state to reverse the
target to its previous condition. Sync and deployment MUST NOT silently overwrite local
modifications, pinned artifacts, or harness edits.

### IV. Deterministic Core, Advisory Agentic Layer

Quartermaster MUST keep cataloging, audit, deployment planning, transformation, loadout
activation, guidance rendering, and rollback deterministic and testable. Model-driven evaluation,
grading, comparison, loadout proposal, and pipeline construction MUST remain advisory proposals
that require developer review before they affect catalog state or deployments. Provider selection
MUST stay behind a configurable gateway or router.

### V. Provenance, Safety, and Faithful Guidance

Quartermaster MUST record source provenance for every artifact and surface it before deployment.
Imports and deployments MUST run configured safety auditors when available and record normalized
findings. Managed guidance files such as CLAUDE.md and AGENTS.md MUST be generated from canonical
guidance plus accepted pipeline directives, with managed sections clearly delimited. Generated or
synthesized documentation MUST remain faithful to the source materials and MUST NOT invent
placeholder artifacts, fake results, fake metrics, or simulated command output.
