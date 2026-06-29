# Changelog

## Unreleased — Phases 11–17 (evaluation → acceptance)

Completes the v3 task ledger (`specs/001-quartermaster/tasks.md`): 302/302 tasks
verified. Full suite 146 pass / 0 fail; typecheck + build clean.

### Added
- **Agentic evaluation (FR-100–105)** wired end-to-end: provider-agnostic gateway,
  `qm eval grade|compare|investigate`, advisory proposal lifecycle
  (`qm proposal`, `qm propose loadouts`) — never auto-applies.
- **Pipelines (FR-110–113)**: composition validation, pipeline-in-loadout directive
  injection, activation gating on invalid pipelines.
- **Guidance (FR-120–122)**: `GuidanceDocument.content` with delimited managed
  sections; guidance deployed per harness during `qm deploy`.
- **Agent query interface + optional MCP (FR-130–132)**: `qm query
  list-skills|search|get|audit|scaffold`, dependency-free JSON-RPC MCP server
  (`qm mcp`, opt-in), contract tests proving MCP↔CLI parity.
- **Safety orchestration (FR-140–142)**: persisted findings/allowlist/overrides
  (migration v4), deploy-time threshold gate, auto-audit on import/scan,
  `qm safety` + `qm allowlist`.
- **Surfaces (NFR-052)**: dark-mode-first TUI (`qm tui`) and local 127.0.0.1 web UI
  (`qm web`).
- **Perf + NFR suites**: 1000-artifact fixture, scan/audit/search timing,
  privacy (no telemetry, no leaked credentials), extensibility, provider-swap.
- README Commands section; quickstart synced to shipped commands.

### Fixed
- Guidance writers emitted managed text without delimiters, breaking FR-122
  round-trip preservation.
- `qm query audit` mapped verdict fields incorrectly (harness/reason) and had
  dead code.
- Scan of 1000 artifacts exceeded the NFR-001 10s ceiling — batched per-artifact
  upserts into a single transaction (`Repository.transaction`).
- Skill-body MCP references now infer the `mcp` capability (FR-004).
