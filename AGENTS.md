<!-- AGENT ENTRY POINT — READ THIS FIRST (handoff / mid-task resume protocol) -->

# ⛳ Agent Entry Point & Handoff Protocol

If you are picking up this project cold — including resuming after a previous
agent stopped mid-task (quota expiry, crash, context loss) — start here. Do not
re-derive the plan or guess which list to follow.

## 1. The one canonical task list
- **`specs/001-quartermaster/tasks.md`** is the ONLY authoritative task list (v3).
- **IGNORE** every other list. These are archived/wrong and must not be followed:
  - `specs/001-quartermaster/archive/tasks-v2-broken.md` (the old "T1-28")
  - `specs/001-quartermaster/archive/backup-v1/tasks.md` (the old "T1-77")
  - Any reference to "T1-18", "T1-28", or "tasks 1-28" anywhere — **dead**.

## 2. FRs and tasks are the SAME work
- The Functional Requirements in `specs/001-quartermaster/spec.md` (FR-001…FR-142)
  are the real features. `tasks.md` decomposes each FR into the build → wire →
  test → verify steps. They are not competing lists. Each task carries its
  `[FR-xxx]` tag. Work `tasks.md` in order; that IS working the FRs in order.

## 3. The gate — no checkmark without evidence
- A task is `[x]` ONLY when its named file exists AND its `Verify:` signal passes
  (a command, an observable behavior, or a green test). **Do not trust any existing
  checkmark** — the v2 list was marked complete with no working code. If you cannot
  produce the evidence, the task stays `[ ]`.
- Never fabricate results, metrics, or command output (see Constitution V).

## 4. Order and spikes
- Phases run top to bottom. Within a phase, tasks run in listed order unless marked
  `[P]` (parallelizable — no shared file, no dependency on an unfinished earlier task).
- **SPIKE tasks (e.g. T026a, T051a, T105a, T120a, T178a) MUST run before the cluster
  they head.** Their decision doc (under `specs/001-quartermaster/design/`) defines
  how the following tasks are implemented; the "audit/confirm" tasks after a spike may
  turn into real implementation work once the spike decides the design.
- Do NOT parallelize dependent work across subagents. A spawned subagent starts with
  zero context — if you delegate, paste this protocol and the specific task lines into
  its prompt.

## 5. How to resume mid-task
1. Open `tasks.md`. Find the first task that is `[~]` (in progress) or, if none, the
   first `[ ]` in dependency order.
2. For a `[~]` task: re-run its `Verify:` signal first. If it passes, mark `[x]` and
   move on. If not, finish it before anything else.
3. Mark a task `[~]` when you start it and `[x]` only after its Verify passes.
4. Current baseline (2026-06-29): core libraries exist but `src/cli/index.ts` is a stub
   (no commands wired) and tests are parked in `.archive/tests/`. Phase 0 (T001–T015g)
   restores the test gate and builds the config layer before any FR is claimed.

<!-- END AGENT ENTRY POINT -->

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
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
