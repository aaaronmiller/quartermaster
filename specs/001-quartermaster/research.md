# Research: Quartermaster

## Existing Solution Sweep

### Decision: Build Quartermaster as a local-first multi-harness compiler rather than adopting a
single existing skill manager.

**Rationale**: The local workspace already contains `.agents/`, `.specify/`, and Hermes config,
which confirms this repository is positioned as an artifact ecosystem manager. Network checks
verified that `skills.sh` and `agentskills.io` are reachable registries/documentation surfaces, not
complete local-first deployment compilers. GitHub repository search surfaced related projects such
as `jeremylongshore/claude-code-plugins-plus-skills`, `xingkongliang/skills-manager`,
`jiweiyeah/Skills-Manager`, Microsoft `skills`, `agent-sh/agnix`, and `JuanJoseGonGi/skill-compact`.
Those cover marketplaces, desktop skill management, validation, curated collections, or
deduplication. They do not replace the stated Quartermaster scope: one organized source library,
declarative harness profiles, per-harness compatibility verdicts, dialect transformations,
previewed reversible deployment, loadouts, managed guidance, safety auditor orchestration, and
advisory model proposals in one deterministic local tool.

**Alternatives considered**:

- Use a registry installer only: rejected because registries do not provide compatibility,
  reversible deployment, loadouts, or guidance compilation.
- Use a desktop skill manager only: rejected because the design requires deterministic CLI and
  agent query surfaces plus harness capability/dialect auditing.
- Use a validator/linter only: rejected because linting does not catalog sources, sync upstreams,
  deploy artifacts, or manage active loadouts.

## Runtime and Language

### Decision: Bun with strict TypeScript.

**Rationale**: The design explicitly selects Bun for fast CLI startup, built-in SQLite, built-in
test runner, and single-binary distribution through `bun build --compile`. TypeScript keeps the
artifact, profile, verdict, and deployment models explicit across all surfaces.

**Alternatives considered**:

- Go: strong for CLIs but would split from the requested Svelte/Hono/OpenTUI TypeScript stack.
- Python: simple scripting but weaker fit for shared TUI/web/domain code in this design.
- Rust: strong binaries but higher implementation cost for the current project constraints.

## Catalog Storage

### Decision: SQLite through `bun:sqlite`.

**Rationale**: Quartermaster is local-first and needs structured queries, incremental rescan state,
verdicts, deployment history, loadouts, and proposals without a service dependency. SQLite gives a
portable embedded database and enough indexing for the expected personal library scale.

**Alternatives considered**:

- JSON files only: rejected because compatibility matrices, drift checks, and provenance queries
  would become fragile as the library grows.
- External database: rejected because it conflicts with the local-first, no-service requirement.

## Harness Knowledge

### Decision: Store harness profiles as YAML data, not adapter classes.

**Rationale**: Harness conventions change quickly and users need to add custom harnesses such as
pi, oh-my-pi, Hermes, and ante without code changes. Profile data can be version-controlled,
shared, validated, and used by deterministic audit logic.

**Alternatives considered**:

- Hard-coded per-harness adapters: rejected because every harness convention change would require
  a release.
- Plugin code for profiles: rejected as too powerful for layout/capability declarations and harder
  to audit.

## Deployment Primitive

### Decision: Prefer symlink deployment with copy fallback.

**Rationale**: Symlinks preserve the single source of truth where reliable. Copy fallback is needed
for Windows-hosted targets and tools that cannot follow links safely.

**Alternatives considered**:

- Copy only: rejected because edits to the source library would require frequent redeployment.
- Symlink only: rejected because some Windows and IDE targets cannot rely on symlinks.

## Git Integration

### Decision: Use system `git` through subprocesses.

**Rationale**: Git is battle-tested for fetching, diffing, revision checks, and pins. Keeping it as
an external capability avoids a heavy bundled dependency and allows catalog/audit/deploy workflows
to continue when git is unavailable.

**Alternatives considered**:

- JavaScript git implementation: rejected for dependency weight and edge-case risk.
- Git bindings: rejected because native binding distribution complicates the single-binary goal.

## Agentic Evaluation

### Decision: Keep model-driven evaluation advisory and provider-agnostic.

**Rationale**: Natural-language skill comparison benefits from model judgment, but deterministic
deployment cannot depend on non-deterministic model calls. An OpenAI-compatible gateway and
optional headless agent mode keep provider choice configurable, while proposals require explicit
developer acceptance.

**Alternatives considered**:

- Deterministic scoring only: rejected because it cannot evaluate natural-language instructions
  well enough for pipeline construction.
- Auto-apply model proposals: rejected by the constitution because it would mutate deterministic
  state without review.

## Interfaces

### Decision: CLI first, then OpenTUI, local Svelte/Hono web, and agent query JSON.

**Rationale**: The CLI is the stable automation and agent surface. OpenTUI and web interfaces can
share the TypeScript core. JSON query commands give agents a predictable way to inspect catalog,
audit, and deployment state without scraping human output.

**Alternatives considered**:

- Web-only UI: rejected because deployment and agent workflows need terminal-first automation.
- TUI in another language: rejected because it fragments the shared engine.
