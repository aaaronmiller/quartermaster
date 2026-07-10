---
date: 2026-06-28
ver: 2.0.0
author: quartermaster-plan
tags: [quartermaster, plan, bun, typescript, sqlite, opentui, svelte, loadouts, pipelines, agentic-evaluation]
---

# Quartermaster — Implementation Plan v2.0

> Implementation plan derived from the full technical design. Covers all 7 implementation phases, architecture components, interface contracts, data model, testing strategy, and project structure.

## 1. Technical Context

### 1.1 Architecture Overview

Quartermaster is a local-first program structured as a thin set of surfaces (a command-line interface, a terminal user interface, a local web interface, and an agent query interface) over a pure domain core and a set of engines. The deterministic engines are:

- **Catalog engine** — turns a subfoldered, multi-source aggregated library into an indexed model
- **Audit engine** — computes per-artifact, per-harness compatibility verdicts from declarative harness profiles
- **Deploy engine** — compiles verdicts and the active loadout into a previewable, reversible deployment
- **Loadout manager** — activates curated subsets per harness
- **Guidance engine** — maintains and translates per-harness rule files

Two further subsystems are model-driven and advisory:

- **Agentic Evaluation engine** — grades, compares, and proposes loadouts and pipelines
- **Auditor orchestrator** — drives external safety scanners

Harness knowledge lives entirely in profile data, not code. The library is read-only to the engines; all mutation happens in the targets and is recorded for reversal. The deterministic core never depends on the agentic layer; the agentic layer only ever produces proposals the developer accepts.

### 1.2 What This System Does NOT Do

- It does not execute artifacts or orchestrate agent runtimes; the harness owns runtime.
- It does not generate artifact content beyond create-and-edit scaffolding.
- It does not host a public registry or marketplace; it consumes sources only.
- It does not mutate the library during deployment.
- It does not require a network connection except for upstream sync and remote import.
- It does not embed a JavaScript git implementation; it shells out to system git and degrades gracefully if git is absent.

### 1.3 Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Runtime | Bun | Primary stack preference; fast startup matters for a frequently invoked CLI; built-in SQLite and test runner remove native and third-party dependencies; `bun build --compile` ships a single portable binary |
| Language | TypeScript | Primary stack preference; strict typing across the artifact, profile, and verdict model prevents whole classes of deployment bugs |
| Catalog store | SQLite via `bun:sqlite` | Local-first, embedded, zero external service, no native build step; proven by comparable managers; supports fast incremental rescans and search |
| Profiles | YAML data files | Human-editable, version-controllable, shareable; harness knowledge as data per NFR-040 |
| Config parsing | YAML, TOML, JSON parsers | Targets read different formats (`.mcp.json`, `config.toml`, `mcp_config.json`, `opencode.json`); translation requires reading and writing all three |
| Git access | System git via subprocess | Avoids a heavy bundled dependency; degrades gracefully when git is unavailable |
| CLI parsing | Lightweight TypeScript argument parser | Avoids framework bloat; the command surface is small and stable |
| Deployment primitive | Filesystem symlink with copy fallback | Single-source-of-truth propagation where links work; copy where they do not (notably unprivileged Windows) |
| Agentic router | OpenAI-compatible endpoint (developer's model gateway) plus optional headless agent | Provider-agnostic, cost-routable, and decoupled from any single subscription given the interactive-versus-programmatic metering split |
| Safety scanners | External auditors orchestrated as subprocesses (SkillScan and siblings) | A mature category after the early-2026 supply-chain attacks; orchestrate rather than rebuild |
| TUI | OpenTUI (Bun-native TypeScript, Zig core) | Shares the engine in-process; production-proven in OpenCode; Ink is conservative fallback |
| Web interface | Svelte 5 + Hono + shadcn-svelte, dark-mode first | Matches the existing stack; served locally by Bun and Hono; optionally packaged as a Tauri 2 desktop app |

### 1.4 Technology Decision Records

**Decision: Profiles as data, not adapter classes**
- Context: Harness conventions move fast; one major terminal harness changed identity and conventions within a single month in 2026.
- Options considered: per-harness adapter classes in code; a plugin system; declarative profile data.
- Chosen because: profile data lets a user add or fix a harness with no release, and lets profiles be shared and version-controlled.
- Trade-offs accepted: a profile schema must be expressive enough to capture layout, capability, and dialect differences, which adds upfront schema design work.

**Decision: Shell out to git rather than bundle a git library**
- Context: Upstream sync needs fetch, diff, and revision pinning.
- Options considered: a JavaScript git implementation; libgit bindings; system git subprocess.
- Chosen because: the system binary is battle-tested, keeps the dependency surface minimal, and lets the rest of the tool function fully offline when git is simply absent.
- Trade-offs accepted: a hard dependency on git being installed for sync and remote import, surfaced as a clear capability message rather than a crash.

**Decision: Capability dialects, not just capability flags**
- Context: Two harnesses can both support hooks yet use incompatible hook mechanisms; Codex hooks do not transfer to Antigravity.
- Options considered: a boolean supports-hooks flag; a capability plus a dialect identifier with optional translators.
- Chosen because: a boolean would wrongly mark a Codex-dialect hook as deployable to Antigravity; modeling a dialect makes the verdict accurate and the reason honest.
- Trade-offs accepted: more verdict logic and a translator registry, justified by correctness.

**Decision: An aggregated managed library is the deploy source of truth, synced from upstreams, preferring a local mirror**
- Context: Three models were possible. (A) Symlink harness directories directly from existing local clones. (B) Clone fresh copies from the remote into a Quartermaster-managed location. (C) Maintain one aggregated managed library that is the source of truth for deployment, populated by sync from upstreams, where each artifact's source record carries both a canonical remote origin and an optional local mirror path that sync prefers when present.
- Options considered: A, B, and C above.
- Chosen because (C): the entire premise is that the developer imposes their own subfolder taxonomy, which is impossible under model A because the layout is dictated by how each upstream repository organizes itself. Model B wastes effort re-cloning what already exists and creates a second copy that drifts. Model C gives one place to organize, back up, version, and reason about the curated collection, lets self-authored and imported artifacts live side by side, decouples the developer's organization from upstream restructuring, and makes deployment a clean library-to-harness operation. Because artifacts are tiny text files, the storage cost of a curated copy is negligible.
- Trade-offs accepted: an edit made directly inside a `/git` clone is not live in the harness until a sync brings it into the library; this is acceptable because sync of text files is near-instant, and for the specific case where a developer wants a subtree linked live to a working clone, a source may be registered as a linked subtree rather than a synced copy.

**Decision: Agentic evaluation is provider-agnostic, advisory, and split into single-turn and multi-turn modes**
- Context: The developer wants model-driven, non-scripted assessment of skills and model-constructed loadouts and pipelines, with configurable turn counts, and runs a model gateway routing several providers. Programmatic agent usage is also metered separately from interactive usage on some plans.
- Options considered: hardwire a single vendor's headless agent; a rigid deterministic scoring engine; a provider-agnostic router with two execution modes.
- Chosen because: a deterministic rubric cannot judge natural-language programs well; a single-vendor binding is fragile under the metering split and the developer's own multi-provider routing. A router with a cheap single-turn path for bulk grading and a turn-bounded multi-turn path for deep pipeline construction fits both the cost reality and the depth requirement.
- Trade-offs accepted: non-determinism, mitigated by treating every output as a reviewable proposal that never auto-applies, and by surfacing rationale.

**Decision: TypeScript-native TUI (OpenTUI) and a Svelte web interface over the same engine**
- Context: The developer wants both a TUI and a clean dark-mode web interface, and has a Bun and TypeScript core.
- Options considered: Toad or Textual (Python), Bubble Tea (Go), Ratatui (Rust), Ink (TypeScript), OpenTUI (TypeScript on Bun with a Zig core).
- Chosen because: a Python, Go, or Rust TUI would fragment the stack and force a separate process or foreign-function bridge; OpenTUI is Bun-native TypeScript, powers OpenCode in production, and lets the TUI share the engine directly.
- Trade-offs accepted: OpenTUI is pre-1.0 and its native renderer needs a Bun or recent Node runtime; Ink is the conservative fallback if a zero-native-dependency build is required.

### 1.5 Architecture Diagram

```
        CLI (qm)   TUI (OpenTUI)   Web (Svelte+Hono, dark-first)   Agent query (qm query --json / optional MCP)
                                   |
        +------------------+-------+--------+------------------+------------------+
        |                  |                |                  |                  |
   Catalog engine     Audit engine     Deploy engine     Loadout manager   Guidance engine
   scan / classify /  type+capability+ plan->apply->      activate subset   canonical rule file
   infer caps /       dialect match    record / flatten / per harness;      -> per-harness
   incremental hash                    link|copy / xlate  switch/move       CLAUDE.md|AGENTS.md
        |                  |                |                  |             + pipeline directives
        +------------------+----------------+------------------+------------------+
                                   |                                   |
                        Core domain model (pure TS)          Advisory subsystems
        Artifact|Source|HarnessProfile|Capability|Verdict     +-----------------------------+
        Loadout|Pipeline|GuidanceFile|DeploymentPlan|Record   | Agentic Evaluation engine   |
                                   |                          |  single-turn (bulk grade)   |
        +-------------+------------+------------+-------+      |  multi-turn (turn-bounded   |
        |             |                         |       |      |   headless investigation)   |
   SQLite catalog  Profile registry      Adapters     Auditor |  via provider-agnostic      |
   (bun:sqlite)    (YAML data files,     link/copy +  orchestr|   model router (gateway)    |
   catalog.db      built-in + user)      config xlate  -ator   +-----------------------------+
                                              |          |        (SkillScan etc.)
        +-----------+-----------+-------------+------------+-------------+
        v           v           v             v            v             v
   Claude Code    Codex     Antigravity    OpenCode    pi / oh-my-pi   Hermes / ante
   skills/ flat   .codex/   ~/.agents/     skill/      (user profile)  (user profile)
   CLAUDE.md      AGENTS.md  AGENTS.md      AGENTS.md
   .mcp.json      config     mcp_config     opencode.json
   hooks ok       .toml      .json          hooks ok
                  hooks ok   hooks dialect
                             differs
```

## 2. Data Model

### 2.1 Schema Design

The catalog is stored in SQLite via `bun:sqlite`. The following tables constitute the full data model:

**sources**: Records the origin of every artifact.
- `id TEXT PRIMARY KEY` — unique identifier
- `kind TEXT NOT NULL` — git | git_subdir | marketplace | local | self
- `reference TEXT` — repo URL, path, or marketplace id
- `ref_branch TEXT` — branch reference
- `imported_revision TEXT` — revision at import time
- `pin_revision TEXT` — non-null means pinned
- `updated_at TEXT NOT NULL`

**artifacts**: Every artifact in the library.
- `id TEXT PRIMARY KEY` — unique identifier
- `type TEXT NOT NULL` — skill | plugin | agent | hook | mcp | command | output_style | script
- `name TEXT NOT NULL`
- `description TEXT`
- `version TEXT`
- `org_path TEXT NOT NULL` — library organizational subfolder path
- `abs_path TEXT NOT NULL` — on-disk location in the library
- `content_hash TEXT NOT NULL` — for incremental scan and local-mod detection
- `required_capabilities TEXT NOT NULL` — JSON array, e.g. ["hooks"], with optional dialect
- `risk_flags TEXT NOT NULL` — JSON array, e.g. ["bundled_script","network"]
- `source_id TEXT NOT NULL REFERENCES sources(id)`
- `is_self_authored INTEGER NOT NULL DEFAULT 0`
- `locally_modified INTEGER NOT NULL DEFAULT 0`
- `updated_at TEXT NOT NULL`

**verdicts**: Compatibility verdict between artifact and harness.
- `artifact_id TEXT NOT NULL REFERENCES artifacts(id)`
- `harness_id TEXT NOT NULL` — profile id
- `result TEXT NOT NULL` — deployable | transform | incompatible
- `reason TEXT`
- `transformation TEXT` — e.g. flatten, translate:mcp, none
- `override_note TEXT` — non-null means manual override
- `computed_at TEXT NOT NULL`
- PRIMARY KEY (artifact_id, harness_id)

**deployments**: Applied deployment records for reversal.
- `id TEXT PRIMARY KEY`
- `harness_id TEXT NOT NULL`
- `scope TEXT` — JSON describing subset scope
- `plan TEXT NOT NULL` — JSON snapshot of the applied plan
- `applied_at TEXT NOT NULL`

**deployment_ops**: Individual operations within a deployment.
- `deployment_id TEXT NOT NULL REFERENCES deployments(id)`
- `seq INTEGER NOT NULL`
- `op TEXT NOT NULL` — create | replace | remove
- `target_path TEXT NOT NULL`
- `method TEXT NOT NULL` — link | copy | write_config
- `prior_state_ref TEXT` — path to captured prior content for reversal
- PRIMARY KEY (deployment_id, seq)

**loadouts**: Named activation profiles.
- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL` — e.g. coding, general, business
- `description TEXT`
- `updated_at TEXT NOT NULL`

**loadout_members**: Artifacts and pipelines in a loadout.
- `loadout_id TEXT NOT NULL REFERENCES loadouts(id)`
- `member_kind TEXT NOT NULL` — artifact | pipeline
- `member_id TEXT NOT NULL`
- PRIMARY KEY (loadout_id, member_kind, member_id)

**loadout_assignments**: Which loadout is active on which harness.
- `harness_id TEXT NOT NULL` — profile id
- `loadout_id TEXT NOT NULL REFERENCES loadouts(id)`
- `active INTEGER NOT NULL DEFAULT 1`
- `assigned_at TEXT NOT NULL`
- PRIMARY KEY (harness_id)

**pipelines**: Named groupings of skills.
- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL`
- `use_case TEXT` — the directive's intent
- `directive TEXT NOT NULL` — text injected into guidance files
- `origin TEXT NOT NULL` — hand | agentic
- `updated_at TEXT NOT NULL`

**pipeline_members**: Ordered members of a pipeline.
- `pipeline_id TEXT NOT NULL REFERENCES pipelines(id)`
- `seq INTEGER NOT NULL`
- `artifact_id TEXT NOT NULL REFERENCES artifacts(id)`
- PRIMARY KEY (pipeline_id, seq)

**guidance_files**: Canonical and per-harness guidance.
- `id TEXT PRIMARY KEY` — 'canonical' or a per-harness id
- `scope TEXT NOT NULL` — canonical | harness
- `harness_id TEXT` — null for canonical
- `body TEXT NOT NULL` — developer-authored content
- `managed_section TEXT` — generated, delimited
- `updated_at TEXT NOT NULL`

**auditors**: Registered external safety scanners.
- `id TEXT PRIMARY KEY` — e.g. skillscan
- `invocation TEXT NOT NULL` — command template
- `stages TEXT NOT NULL` — JSON: e.g. ["static","predict","sandbox"]
- `parser TEXT NOT NULL` — how to normalize output
- `enabled INTEGER NOT NULL DEFAULT 1`

**audit_findings**: Safety assessment results.
- `artifact_id TEXT NOT NULL REFERENCES artifacts(id)`
- `auditor_id TEXT NOT NULL REFERENCES auditors(id)`
- `score REAL` — normalized 0-100 safety score
- `severity TEXT` — info | low | medium | high | critical
- `findings TEXT NOT NULL` — JSON detail
- `evaluated_at TEXT NOT NULL`
- PRIMARY KEY (artifact_id, auditor_id)

**eval_proposals**: Agentic evaluation outputs.
- `id TEXT PRIMARY KEY`
- `kind TEXT NOT NULL` — grade | comparison | loadout | pipeline
- `payload TEXT NOT NULL` — JSON proposal body
- `rationale TEXT`
- `model TEXT` — which model produced it
- `turns INTEGER` — multi-turn budget used
- `accepted INTEGER NOT NULL DEFAULT 0`
- `created_at TEXT NOT NULL`

**Indexes**:
- `idx_artifacts_type ON artifacts(type)`
- `idx_artifacts_caps ON artifacts(required_capabilities)`
- `idx_verdicts_harness ON verdicts(harness_id, result)`

Harness profiles are not stored in SQLite; they live as YAML files (built-in under the package, user profiles under the config directory) so they are shareable and version-controllable.

### 2.2 Relationships and Access Patterns

| Query Pattern | Frequency | Implementation |
|---------------|-----------|----------------|
| List artifacts by type or capability | High-frequency read | Indexed columns on `type` and `required_capabilities` |
| Compute or read verdict matrix for a harness | High during audit and deploy | Verdict computed as a pure function from artifact plus profile; cached in `verdicts`, recomputed when artifact `content_hash` or profile changes |
| Detect drift between deployed target and library | On status | Compare current target content hash against the artifact `content_hash` recorded at deploy time |
| Reverse a deployment | Occasional, must be exact | Replay `deployment_ops` in reverse using captured `prior_state_ref` |
| Incremental rescan | Every scan | Compare on-disk content hash to stored `content_hash`; touch only changed rows |

### 2.3 Migration Strategy

Schema versions are tracked in a `meta` table with a single `schema_version` row. Migrations are ordered, forward-only SQL applied on startup when the stored version is behind the binary's expected version, each wrapped in a transaction so a failed migration leaves the prior version intact.

## 3. Component Specifications

### 3.1 Catalog engine (`src/catalog`)
- **Responsibility**: Walk configured roots, classify each artifact's type, parse metadata, infer required capabilities and dialect, compute content hashes, and persist to SQLite incrementally.
- **Interface**: 
  ```typescript
  interface CatalogEngine {
    scan(roots: string[]): Promise<ScanResult>;
    rescanIncremental(): Promise<ChangeSet>;
    search(query: CatalogQuery): Promise<Artifact[]>;
  }
  ```
- **Dependencies**: Filesystem, SQLite, frontmatter and manifest parsers, the risk scanner.
- **Error handling**: An unparseable artifact is cataloged with a parse-error flag rather than aborting the scan; the scan reports the count of parse errors.

### 3.2 Capability inference (`src/catalog/capabilities`)
- **Responsibility**: Determine which capabilities and dialects an artifact requires.
- **Method**: Deterministic first. A hook artifact requires the `hooks` capability tagged with its source dialect. An artifact declaring or referencing an MCP server requires `mcp`. A plugin requires the union of capabilities of its bundled components. An artifact bundling executable scripts requires `scripts`. Frontmatter may override inferred capabilities.
- **Error handling**: When inference is ambiguous, the artifact is tagged `needs-review` and treated conservatively by the audit engine.

### 3.3 Profile registry (`src/profiles`)
- **Responsibility**: Load, validate, and serve built-in and user harness profiles.
- **Interface**: `list(): HarnessProfile[]`, `get(id): HarnessProfile`, `validate(profile): ValidationResult`.
- **Error handling**: An invalid profile is rejected with field-level messages and excluded from audit and deployment, never partially applied.

### 3.4 Audit engine (`src/audit`)
- **Responsibility**: Compute a verdict for one artifact against one profile, and matrices across all artifacts and harnesses.
- **Method (pure)**: If the profile does not support the artifact's type, the verdict is incompatible. If a required capability is unsupported, incompatible. If a required capability is supported but the artifact's dialect differs and no translator exists, incompatible with a dialect reason. If a translator or a flatten is required, transform with the transformation named. Otherwise deployable. A manual override supersedes the computed result and is marked as such.
- **Interface**:
  ```typescript
  interface AuditEngine {
    verdict(artifact: Artifact, profile: HarnessProfile): Verdict;
    matrix(artifacts: Artifact[], profiles: HarnessProfile[]): VerdictMatrix;
  }
  type VerdictResult = "deployable" | "transform" | "incompatible";
  interface Verdict {
    result: VerdictResult;
    reason?: string;
    transformation?: "flatten" | `translate:${string}` | "none";
    override?: { note: string };
  }
  ```
- **Error handling**: Pure and total; every input pair yields a verdict with a reason.

### 3.5 Deploy engine (`src/deploy`)
- **Responsibility**: Compile a deployment plan from verdicts and a profile's layout rules, apply it through adapters, and record it for reversal.
- **Interface**: `plan(scope, profile): DeploymentPlan`, `apply(plan, opts): DeploymentRecord`, `revert(deploymentId): void`, `status(profile): StatusReport`.
- **Dependencies**: Audit engine, adapters, SQLite.
- **Error handling**: Planning is side-effect free. Apply captures prior state before each mutating op so any failure can be reversed; a mid-apply failure stops and reports a recoverable, recorded partial state.

### 3.6 Adapters (`src/deploy/adapters`)
- **Responsibility**: Perform the concrete placements.
- **Sub-adapters**: A link-or-copy placer (symlink with copy fallback, directory junction option on Windows), a flattener that maps a nested library path to a flat target name and resolves collisions, and config translators that read the canonical config form and emit the target dialect.
- **Error handling**: Each adapter validates its output (for example, a translated config is parsed back and checked) before the op is committed to the plan as applied.

### 3.7 Sources and sync (`src/sources`)
- **Responsibility**: Import from the four source kinds, check upstreams, detect local modification by comparing current content hash against the imported revision's hash, report conflicts, honor pins, and update only unmodified artifacts.
- **Error handling**: A sync never overwrites a locally modified artifact without confirmation; conflicts are listed and left for the developer.

### 3.8 Risk scanner (`src/risk`)
- **Responsibility**: Flag bundled executable scripts, network access, shell execution, and secret access patterns, recording flags on the artifact and surfacing them in plans.

### 3.9 Composition module (`src/compose`, optional)
- **Responsibility**: The carried SkillFlow validator. Validate input/output contract compatibility, acyclicity, and adjective attachment across a declared composition using the Noun/Verb/Adjective model. Independent of the deployment path and disableable.

### 3.10 Loadout manager (`src/loadouts`)
- **Responsibility**: Define loadouts, assign and switch them per harness, and copy or move them between harnesses. Resolves a loadout to a concrete set of compatible artifacts for a harness by intersecting loadout membership with that harness's verdicts, then drives the Deploy engine to activate the set and deactivate the rest.
- **Interface**: `define(name, members)`, `assign(loadoutId, harnessId)`, `switch(harnessId, loadoutId)`, `resolve(loadoutId, harnessId): Artifact[]`, `copy(loadoutId, fromHarness, toHarness)`.
- **Error handling**: Switching is computed as a deployment plan and applied through the reversible Deploy engine, so a failed switch is recoverable.

### 3.11 Pipeline engine (`src/pipelines`)
- **Responsibility**: Define, validate, and store named pipelines; expand a pipeline into its member artifacts plus its guidance directive when a loadout activates it.
- **Interface**: `define(name, members, directive)`, `validate(pipelineId)`, `expand(pipelineId): { artifacts, directive }`.
- **Dependencies**: Catalog (membership existence), optional composition module (FR-113).

### 3.12 Guidance engine (`src/guidance`)
- **Responsibility**: Maintain the canonical guidance file, translate it to each harness's filename and form, and inject active pipeline directives into a clearly delimited managed section while preserving developer-authored content outside it.
- **Interface**: `render(harnessId, activeLoadout): string`, `deploy(harnessId)`.
- **Error handling**: The managed section is delimited by stable markers; rendering reads the current target file, replaces only the managed block, and validates the result before writing.

### 3.13 Agentic Evaluation engine (`src/eval`)
- **Responsibility**: Grade artifacts, compare artifacts, propose loadouts, and construct pipelines, using model calls. Single-turn tasks issue one structured request to the configured endpoint and parse a JSON result. Multi-turn tasks dispatch a turn-bounded headless agent (or the Agent SDK) with read access to the library, capturing a structured proposal. All outputs are written as `eval_proposals`, never applied directly.
- **Interface**:
  ```typescript
  interface EvalEngine {
    grade(artifactIds: string[], categories: string[]): Proposal;
    compare(artifactIds: string[], categories: string[]): Proposal;
    proposeLoadouts(): Proposal[];
    constructPipelines(instruction?: string, maxTurns?: number): Proposal[];
  }
  ```
- **Dependencies**: A provider-agnostic model router; catalog read access for the headless agent.
- **Error handling**: Respects a turn and budget ceiling and fails closed; evaluated artifact content is treated as untrusted (injection risk) and the evaluator holds no deployment authority.

### 3.14 Model Router (`src/eval/router`)
- **Interface**:
  ```typescript
  interface ModelRouter {
    single(req: { system: string; prompt: string; model?: string }): Promise<string>;
    multiTurn(req: { task: string; tools: "read-library"; maxTurns: number; model?: string }): Promise<string>;
  }
  ```

### 3.15 Auditor orchestrator (`src/audit-safety`)
- **Responsibility**: Register external auditors, invoke them on import and pre-deploy, normalize their output into `audit_findings`, gate deployment on a configurable threshold, and honor the trusted allowlist. Subsumes and extends the static risk scanner.
- **Interface**: `register(auditor)`, `assess(artifactId): Finding[]`, `gate(artifactId, threshold): { pass, overrideRequired }`.
- **Default auditor**: SkillScan invoked across its static, predict, and sandbox stages; additional auditors registered by data.

### 3.16 Agent query interface (`src/query`) and surfaces (`src/cli`, `src/tui`, `src/web`)
- **Responsibility**: Expose stable, machine-readable query operations (`list`, `search`, `describe`, `audit`, `scaffold`) consumed by the CLI with `--json`, optionally wrapped by a thin MCP server. The TUI (OpenTUI) and the web interface (Svelte and Hono) render the same engine for browsing the catalog, the compatibility matrix, loadouts, and proposals.
- **Error handling**: Query output is versioned and schema-stable so agents can depend on it; the MCP wrapper adds no logic beyond transport.

## 4. Interface Contracts

### 4.1 CLI Commands

```
qm scan [--root PATH ...]           — Scan library roots and update catalog. Incremental by default.
qm import <source>                   — Import artifacts from owner/repo, URL, subdir, marketplace id, or local path.
qm sync [<source>] [--check]         — Check or update upstreams. --check reports without writing.
qm audit [--harness ID] [--type T] [--only blocked|transform] — Print compatibility matrix.
qm plan <harness|group|all> [--scope PROFILE|--tag T|--path SUBTREE] — Dry-run plan.
qm deploy <harness|group|all> [--scope ...] [--yes] — Apply plan. Shows plan and waits unless --yes.
qm revert <deployment-id | --last>   — Reverse a recorded deployment to its prior state.
qm status [<harness>]                — Show deployed artifacts, method, drift, orphans.
qm profile list | show <id> | new <id> | edit <id> | validate <id> — Manage harness profiles.
qm new <type> <org-path>             — Scaffold a self-authored artifact.
qm compose validate <composition.yaml> — Optional: validate a composition with NVA model.
qm loadout list | new <name> | add <name> <artifact|pipeline> | assign <name> <harness> | switch <harness> <name> | copy <name> <from-harness> <to-harness> — Manage loadouts.
qm pipeline list | new <name> | validate <name> | add-to <loadout> <name> — Define and attach pipelines.
qm evaluate grade <artifact ...> --categories C[,C] [--model M] — Advisory grading.
qm evaluate compare <artifact> <artifact ...> --categories C[,C] [--model M] — Advisory comparison.
qm evaluate propose-loadouts [--model M] — Candidate loadout proposals.
qm evaluate build-pipelines [--instruction "..."] [--max-turns N] [--model M] — Pipeline construction.
qm proposal list | show <id> | accept <id> | reject <id> — Review agentic proposals.
qm guidance edit | deploy <harness|all> — Edit canonical guidance; deploy per-harness files.
qm safety register <auditor> | scan <artifact|--all> | threshold <score> — Safety auditor management.
qm query list | search <q> | describe <artifact> | audit <artifact> | scaffold <type> --json — Agent query interface.
qm tui — Launch the terminal interface (OpenTUI).
qm web [--port N] — Serve the local dark-mode web interface.
```

### 4.2 Harness Profile Contract (YAML)

```yaml
# profiles/claude-code.yaml
id: claude-code
name: Claude Code
supports:
  types: [skill, plugin, agent, hook, mcp, command, output_style, script]
  capabilities:
    hooks:   { dialect: claude }
    mcp:     { dialect: claude-mcp-json }
    subagents: {}
    plugins: {}
layout:
  skill:
    scope:   { global: "~/.claude/skills", project: ".claude/skills" }
    dirname: skills
    flat:    true
  mcp:
    scope:   { global: "~/.claude/.mcp.json" }
    format:  claude-mcp-json
  hook:
    scope:   { global: "~/.claude/hooks" }
    format:  claude
```

```yaml
# profiles/opencode.yaml (illustrative divergences)
id: opencode
name: OpenCode
supports:
  types: [skill, agent, hook, mcp, command]
  capabilities:
    hooks: { dialect: opencode }
    mcp:   { dialect: opencode-json }
layout:
  skill:
    scope:   { global: "~/.config/opencode/skill", project: ".opencode/skill" }
    dirname: skill
    flat:    true
  mcp:
    scope:   { global: "~/.config/opencode/opencode.json" }
    format:  opencode-json
```

User-defined harnesses (pi, oh-my-pi, Hermes, ante) are authored in the same shape under the user config directory and participate identically.

### 4.3 Config Translation Contract

```
translate(canonical: McpServerDef, targetFormat): string
  claude-mcp-json   -> a .mcp.json fragment
  codex-toml        -> a config.toml block
  antigravity-json  -> an mcp_config.json fragment
  opencode-json     -> an opencode.json fragment
  Each output is parsed back and validated before the plan records the op.
```

## 5. Security Considerations

### 5.1 Threat Model

The primary risks are deploying a malicious or unreviewed third-party artifact, leaking a git credential, and corrupting a target through a bad translation or a failed partial apply. Mitigations: provenance and risk flags surfaced before every apply, dry-run by default, translated configs validated before writing, prior state captured for reversal, and the library never mutated.

### 5.2 Authentication and Authorization

No accounts. The only credential is an optional git access token for private sources, read from the environment or the OS keychain, never written into plans, logs, or shared profiles.

### 5.3 Data Protection

All catalog and history data is local. There is no telemetry. Captured prior-state snapshots used for reversal are stored under the local config directory and pruned on a retention policy.

### 5.4 Supply Chain

The tool's own dependency surface is kept minimal (Bun built-ins, a small parser set) and lockfile-pinned. Artifact-level supply-chain risk (demonstrated by the early-2026 campaigns against the skill ecosystem) is handled by the Auditor orchestrator, which gates import and deployment on registered scanner findings and a configurable threshold.

### 5.5 Agentic Safety

Content sent to the evaluation engine is treated as untrusted, because an artifact can carry prompt-injection payloads. The evaluator is sandboxed in two senses: it holds no authority to mutate deployment state (it only writes proposals), and the multi-turn headless backend runs under a strict turn budget and a read-only tool policy over the library. Credentials for the model endpoint are local and never embedded in proposals or logs.

## 6. Implementation Phases

### Phase 1: Catalog Core
- Aggregated-library domain model for all eight artifact types and sources; the SQLite store.
- Scanner with type classification, metadata parsing, capability and dialect inference, content hashing, and incremental rescan.
- Catalog search and provenance recording.
- **Validates**: FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-070.

### Phase 2: Profiles and Audit
- Profile schema, loader, and validator; built-in profiles for Claude Code, Codex, Antigravity, and OpenCode; user profile authoring.
- Pure verdict engine over type, capability, and dialect; the compatibility matrix; manual overrides.
- **Validates**: FR-020, FR-021, FR-022, FR-023, FR-030, FR-031, FR-032, FR-033, FR-034.

### Phase 3: Deploy Engine
- Plan compilation; the flattener; link-or-copy placement with copy fallback; config translators; incompatible-artifact exclusion; dry-run and apply; deployment recording and reversal; group and scope targeting; status, drift, and orphan detection.
- **Validates**: FR-040, FR-041, FR-042, FR-043, FR-044, FR-045, FR-046, FR-047, FR-048, FR-060, FR-061.

### Phase 4: Loadouts, Guidance, and Safety
- Loadout manager (define, assign, switch, copy, deactivate); guidance engine (canonical file, per-harness translation, managed-section directive injection); auditor orchestrator (register, assess, normalize, gate, allowlist) subsuming the static risk scanner.
- **Validates**: FR-090, FR-091, FR-092, FR-093, FR-094, FR-120, FR-121, FR-122, FR-071, FR-140, FR-141, FR-142.

### Phase 5: Sources and Currency
- Import from the four source kinds with local-mirror-preferred sync; self-authored scaffolding; upstream check and update; local-modification protection; conflict reporting; pinning.
- **Validates**: FR-010, FR-011, FR-012, FR-013, FR-014, FR-050, FR-051.

### Phase 6: Agentic Evaluation and Pipelines
- Provider-agnostic model router; single-turn grading and comparison; multi-turn turn-bounded investigation; loadout and pipeline proposals; the proposal review flow; pipeline definition, validation, and loadout inclusion; the optional Noun/Verb/Adjective composition module.
- **Validates**: FR-100, FR-101, FR-102, FR-103, FR-104, FR-105, FR-110, FR-111, FR-112, FR-113, FR-080.

### Phase 7: Surfaces
- Agent query interface with stable JSON and the optional MCP wrapper; the OpenTUI terminal interface; the Svelte and Hono dark-mode web interface built with the frontend-design-masterclass skill.
- **Validates**: FR-130, FR-131, FR-132, NFR-052.

## 7. Testing Strategy

### 7.1 Unit Tests

| Module | Key Test Cases |
|--------|----------------|
| Capability inference | Hook tagged with dialect; plugin capability union; frontmatter override; ambiguous needs-review |
| Audit engine | Type unsupported; capability unsupported; dialect mismatch with and without translator; flatten transform; override supersedes |
| Flattener | Nested path to flat name; collision resolution; library left intact |
| Config translators | Round-trip parse-back validation for each target format |

### 7.2 Integration Tests

| Scenario | Validates |
|----------|-----------|
| Nested library deployed to a flat-only harness, all discoverable | FR-041, SC-001 |
| Hook excluded from a no-hook harness with reason, rest deployed | FR-044, SC-002 |
| One canonical MCP definition deployed to two formats | FR-043 |
| Deploy then revert restores prior state | FR-046, SC-005 |
| Sync updates unmodified, protects modified | FR-013, SC-003 |

### 7.3 Performance Benchmarks

| Benchmark | Target | Method |
|-----------|--------|--------|
| Full scan, 1000 artifacts | under 10 s | Timed scan of a synthetic library |
| Incremental rescan | under 2 s | Timed rescan after a single change |
| Audit, 1000 artifacts x 10 harnesses | under 5 s | Timed matrix computation |

## 8. Project Structure

```
quartermaster/
├── src/
│   ├── domain/            # Artifact, Source, HarnessProfile, Verdict, Loadout, Pipeline, GuidanceFile, plans, records
│   ├── catalog/           # scan, classify, search
│   │   └── capabilities/  # capability and dialect inference
│   ├── sources/           # import and sync (git subprocess, local-mirror-preferred)
│   ├── profiles/          # harness profile loader, validator, registry
│   ├── audit/             # pure verdict engine and matrix
│   ├── deploy/            # plan, apply, revert, status
│   │   └── adapters/      # link-or-copy, flatten, config translators
│   ├── loadouts/          # define, assign, switch, copy
│   ├── pipelines/         # define, validate, expand
│   ├── guidance/          # canonical + per-harness rule files, directive injection
│   ├── eval/              # agentic evaluation, model router (single + multi-turn)
│   ├── audit-safety/      # auditor orchestration (SkillScan et al.), gating, allowlist
│   ├── compose/           # optional NVA composition validator
│   ├── query/             # stable agent query operations
│   ├── db/                # bun:sqlite store and migrations
│   ├── cli/               # command surface
│   ├── tui/               # OpenTUI terminal interface
│   └── web/               # Hono server + Svelte 5 dark-mode client
├── profiles/              # built-in harness profiles (yaml)
│   ├── claude-code.yaml
│   ├── codex.yaml
│   ├── antigravity.yaml
│   └── opencode.yaml
├── tests/
└── package.json
```

The structure is layer-based within a single package because the domain core and the deterministic engines have clear, stable boundaries and the surfaces (CLI, TUI, web, query) are thin shells over them. The advisory subsystems (`eval`, `audit-safety`) are isolated so the deterministic path never depends on them. Built-in harness knowledge is data under `profiles/` so it evolves without code changes.

## 9. References

1. Claude Code skills documentation and the open issues establishing flat-only top-level skill discovery and the symlink-flatten workaround (anthropics/claude-code issues 16438, 18192, 20805, 28266, 39138, 40640).
2. vercel-labs/skills cross-agent installer: symlink-based, multi-target, per-agent path contract, skill-only scope.
3. Cross-harness convention differences: OpenCode singular `skill/` directory and glob mismatch (anomalyco/opencode issue 6177); Codex hooks not transferable to Antigravity and divergent MCP config formats (`.mcp.json`, `config.toml`, `mcp_config.json`, `opencode.json`).
4. iamzhihuix/skills-manage and xingkongliang/skills-manager: local-first, multi-tool, presets and collections as prior art.
5. SkillNet (arXiv 2603.04448): separation of taxonomic, relational, and package layers, informing profiles-as-data.
6. SkillFlow PRD audit (prior artifact): origin of the carried Noun/Verb/Adjective composition module.
7. SkillScan (NMitchem/SkillScan) and sibling scanners: three-stage static, LLM-prediction, and sandbox auditing, provider-agnostic, SARIF output, allowlists.
8. Headless agent dispatch: `claude -p` with `--max-turns` and structured output, and the Agent SDK.
9. OpenTUI (anomalyco/opentui): Bun-native TypeScript TUI core powering OpenCode.
10. Guidance-file convention: CLAUDE.md for Claude Code and the cross-tool AGENTS.md standard.
