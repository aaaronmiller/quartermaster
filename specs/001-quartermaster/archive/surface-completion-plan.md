# Surface Completion Plan: Quartermaster

**Date**: 2026-06-26
**Context**: Recovered transcript and `skillflow-prd.pdf`

## Goal

Complete the parts of Quartermaster that express the original product intent to humans and
agents: a usable web experience, a useful terminal state model, and richer machine-readable query
operations. The deterministic catalog, audit, deployment, loadout, guidance, safety, and proposal
core remains the source of truth.

## Recovered Intent

- The web UX must help a developer understand skill overload quickly: what is installed, what is
  active, which harnesses can run what, which artifacts are risky, and which proposals need review.
- The TUI must be a dense operational console, not a marketing page: catalog, compatibility,
  deployment, loadout, guidance, and proposal state should be scannable in one terminal session.
- Agents must be able to query the system through stable JSON rather than scraping display output.
- The old SkillFlow visual taxonomy survives as composition and pipeline context, but Quartermaster
  is the broader cross-harness compiler.

## Implementation Tasks

1. Add a shared surface summary model that derives catalog counts, risk counts, compatibility
   totals, loadout state, pipeline state, proposal state, deployment history, and recommendations
   from the repository.
2. Extend `qm query` with `summary`, `search`, `proposals`, `loadouts`, and `pipelines` JSON
   operations while preserving existing command names.
3. Replace the placeholder TUI state with a real operator model containing dashboard sections and
   actionable commands.
4. Expand the Hono API to expose dashboard, catalog search, audit, deployment, loadout, pipeline,
   proposal, and guidance data.
5. Replace the bare Svelte table with a dark, dense, responsive dashboard for catalog, matrix,
   loadouts, pipelines, proposals, and deployment preview.
6. Add tests that prove the new query, TUI state, and web API surfaces expose real data from the
   catalog rather than placeholders.
7. Update `CHANGELOG.md` and run validation.

## Acceptance

- `qm query summary --json` returns real counts and recommendations from the current catalog.
- `qm query search <text> --json` filters real artifacts by name, description, path, type,
  capability, and risk flag.
- TUI state includes sections for catalog, harness readiness, loadouts, pipelines, proposals, and
  deployments with command hints.
- Web routes serve JSON for every major view and use the same summary model as the TUI.
- The Svelte app presents a complete local dashboard with no fake metrics or placeholder content.
