# Changelog

## [Unreleased]

### Added

- Added Spec Kit constitution, feature specification, implementation plan, research, data model,
  contracts, quickstart, checklist, and task breakdown for Quartermaster.
- Implemented Bun/TypeScript Quartermaster CLI, SQLite catalog, built-in harness profiles,
  compatibility audit, reversible deployment planning/apply/rollback, loadouts, guidance rendering,
  safety finding normalization, advisory proposals, agent query JSON, TUI state, and Hono routes.
- Completed the recovered UX surface layer with shared dashboard summaries, richer `qm query`
  operations, a dense TUI state model, launchable `qm tui` and `qm web` commands, expanded Hono
  routes, and a dark-mode web dashboard shell backed by real catalog data.
- Spruced up the local web dashboard using the frontend design masterclass guidance with a stronger
  dark palette, loaded typography, command rail, compatibility radar, searchable catalog, status
  geometry, type bars, and richer empty states.
- Added persisted harness-to-loadout assignment state, per-harness active/inactive status, and web
  plus CLI controls for assigning loadouts to each harness so the surface shows what each CLI is
  actually running.
- Added ordered skill-sequence construction in the web UX plus LLM-backed audit/improvement
  proposal hooks through the OpenAI-compatible model gateway configuration.
- Expanded the web UX into a full HTML control console for implemented Quartermaster operations,
  including scan, catalog, audit, deploy preview/apply, rollback, import, sync, guidance, status,
  query, loadout admin, pipeline admin, proposal decisions, and error pages that do not dump raw
  JSON.
- Added web and CLI loadout editing for replace, reorder, and member removal; added all-CLI active
  skill auditing; and added review-gated AI fix proposals that can write accepted skill repairs.
- Added real mixed artifact fixtures and Bun unit, contract, integration, and quickstart tests.
