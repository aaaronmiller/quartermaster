---
date: 2026-06-28
ver: 2.0.0
author: quartermaster-research
tags: [quartermaster, research, prior-art, cross-harness, deployment, skill-management]
---

# Quartermaster — Prior Art Research

> Research findings and comparative analysis of existing solutions in the cross-harness agent artifact management space.

## 1. Key Findings

The cross-harness artifact management space is nascent and fragmented. Existing tools focus on skill-only installations, single-harness management, or distribution catalogs — none provide the full combination of multi-type artifact organization, compatibility-aware deployment, upstream currency, loadouts, agentic evaluation, and safety auditing that Quartermaster targets.

## 2. Existing Solutions

### vercel-labs/skills (`npx skills add`)
- **Type**: Cross-agent installer
- **Strengths**: 
  - De facto standard for cross-agent skill installation
  - 50+ targets supported
  - Symlink-based propagation means edits in source are live in targets
  - Clean per-agent path contract
- **Weaknesses**:
  - Skills only — no plugins, hooks, agents, scripts, MCP configs, or other artifact types
  - No capability auditing — will happily deploy a skill to a harness that cannot use it
  - No subfolder-organize-then-flatten — forces source to match target layout
  - No canonical-to-per-harness config translation
  - Thin multi-upstream currency model
- **Gap Quartermaster fills**: Full artifact-type coverage, capability audit with reasons, organize-and-flatten, config translation, unified upstream sync

### xingkongliang/skills-manager
- **Type**: Multi-tool desktop and CLI manager
- **Strengths**: 
  - Presets, tags, git sync, upstream update tracking
  - Both GUI and CLI
- **Weaknesses**:
  - Skill-centric — does not handle other artifact types
  - No per-artifact capability audit across heterogeneous harnesses
  - No config-format translation
  - No subfolder organization model
- **Gap Quartermaster fills**: Heterogeneous artifact types and capability-aware deployment

### iamzhihuix/skills-manage
- **Type**: Local-first Tauri manager
- **Strengths**: 
  - Local-first with no telemetry
  - Collections, project scan, marketplace import
  - Built with modern stack (Tauri)
- **Weaknesses**:
  - Skill-centric — no compatibility verdict engine
  - No hooks/MCP/agent deployment semantics
- **Gap Quartermaster fills**: Compatibility engine and multi-type deployment

### sickn33/antigravity-awesome-skills
- **Type**: Large multi-tool installable catalog with bundles
- **Strengths**: 
  - Comprehensive catalog
  - Bundles for common use cases
- **Weaknesses**:
  - Distribution catalog, not a personal organize-audit-deploy manager
  - Skill-centric
- **Gap Quartermaster fills**: Personal source-of-truth management with audit and reversal

### Anthropic Plugin and Marketplace Tooling
- **Type**: First-party harness tooling (`/plugin`, `claude plugin validate`)
- **Strengths**: 
  - First-party integration
  - Validates manifests
  - Registry distribution
- **Weaknesses**:
  - Single-harness (Claude Code only)
  - Validates structure, not cross-harness capability fit
  - Flat skills directory is the very constraint being worked around
- **Gap Quartermaster fills**: Cross-harness compilation and the flat-directory workaround

### oh-my-openagent (omo)
- **Type**: Harness-specific skill editions
- **Strengths**: 
  - Explicitly ships harness-specific editions (full for OpenCode, reduced for Codex)
  - Acknowledges capability differences across harnesses
- **Weaknesses**:
  - Hand-maintained per-harness editions of one product
  - Not a general engine — each new harness requires manual editioning
- **Gap Quartermaster fills**: Generalizes the manual per-harness editioning into an automated audit and compile step

### SkillScan and Sibling Scanners
- **Type**: Safety scanners (skill-security-scan, Sentry, LobeHub, Trail of Bits skills)
- **Strengths**: 
  - Static rules plus LLM behavioral prediction plus sandbox execution
  - Provider-agnostic
  - Allowlists and SARIF output
- **Weaknesses**:
  - Single-purpose safety tools, not library managers
  - No organization, deployment, or loadout concept
- **Gap Quartermaster fills**: Orchestrating these as pluggable auditors and gating import and deployment on their findings

### Toad and OpenTUI
- **Type**: Terminal UI frameworks
- **Strengths**: 
  - Toad is a polished universal agent frontend on Textual over the Agent Client Protocol
  - OpenTUI is a Bun-native TypeScript TUI core (Zig native renderer)
  - Ink is a mature React-based TUI framework
- **Weaknesses**:
  - Toad is a finished product, not a TUI scaffold, and is Python — not compatible with the TypeScript stack
  - Not management tools
- **Gap Quartermaster fills**: Informs the choice of a TypeScript-native TUI that shares the engine; Toad is a peer agent frontend rather than a building block

### Headless Agents (`claude -p --max-turns`, Agent SDK)
- **Type**: Programmatic agent dispatch
- **Strengths**: 
  - Turn-bounded, machine-readable agent dispatch
  - Suitable for structured multi-turn investigation
- **Weaknesses**:
  - Vendor-specific
  - Metered separately from interactive usage on some plans
- **Gap Quartermaster fills**: Provides the multi-turn backend for agentic evaluation, used through a provider-agnostic router rather than hardwired

## 3. Patterns Adopted

1. **Symlink-based deployment with single-source-of-truth propagation** — adopted from vercel-labs/skills. Makes a library edit visible to every linked target without redeployment and matches the flat-directory workaround the Claude Code community already uses manually.

2. **Local-first SQLite cataloging with no telemetry** — adopted from iamzhihuix/skills-manage. Keeps the library private and the workflow fully offline.

3. **Declarative, version-controllable, data-only harness profiles** — adopted in spirit from SkillNet's separation of taxonomic, relational, and package layers. Fast-moving harness conventions become data rather than code.

4. **Preview-and-reversible mutation with per-item rollback** — adopted from the developer's own Guardian upgrade-orchestrator pattern. Every deployment is dry-runnable and revertable.

## 4. Patterns Avoided

1. **Cloud or SaaS catalog** — the library is private and the workflow must run offline.

2. **Runtime execution engine** — Quartermaster compiles and deploys artifacts and hands runtime to the harness, keeping it from re-implementing orchestration that the harnesses already own.

3. **Single global flat library** — reproduces the exact organizational chaos the project exists to fix.

4. **Hardcoded per-harness logic** — avoided in favor of profiles, because a harness changed identity and conventions within one month in 2026 and code-level coupling would not survive that pace.

## 5. Existing Solutions Comparison Matrix

| Solution | Skill Mgmt | Multi-Type | Cross-Harness Audit | Config Translation | Subfolder Organize | Upstream Sync | Loadouts | Safety Audit | TUI | Web UI |
|----------|-----------|------------|--------------------|--------------------|-------------------|---------------|----------|-------------|-----|--------|
| vercel-labs/skills | Yes | No (skills only) | No | No | No | Partial | No | No | No | No |
| skills-manager (xingkongliang) | Yes | No (skills only) | No | No | No | Yes | Tags only | No | Yes | Yes |
| skills-manage (iamzhihuix) | Yes | No (skills only) | No | No | No | Yes | Collections | No | No | Yes |
| antigravity-awesome-skills | Yes | Partial (bundles) | No | No | No | Partial | No | Check only | No | No |
| Anthropic plugin tooling | Yes (Claude only) | No | No | No | No | No | No | Validation only | No | No |
| oh-my-openagent | Yes | Partial (skill editions) | Manual editioning | No | No | Yes | Config-based | No | No | No |
| **Quartermaster** | **Yes** | **All 8 types** | **Automated** | **Yes** | **Yes** | **Comprehensive** | **Named + switchable** | **Pluggable auditors** | **Yes** | **Yes** |

## 6. Key Technical References

- Claude Code skills documentation and related issues: anthropics/claude-code issues 16438, 18192, 20805, 28266, 39138, 40640 — establishing the flat-only top-level skill discovery constraint and the symlink-flatten workaround.
- OpenCode singular `skill/` directory and glob mismatch: anomalyco/opencode issue 6177 — demonstrating how even a minor convention difference (singular vs plural directory name) breaks naive skill installation.
- Cross-harness MCP config format divergences: `.mcp.json` (Claude Code), `config.toml` (Codex), `mcp_config.json` (Antigravity), `opencode.json` (OpenCode) — the primary driver for the config translation requirement.
- SkillNet (arXiv 2603.04448): Separation of taxonomic, relational, and package layers — informing the profiles-as-data architectural decision.
- SkillFlow PRD audit (prior artifact): Origin of the carried Noun/Verb/Adjective composition module.
- Guidance-file convention: CLAUDE.md for Claude Code and the cross-tool AGENTS.md standard read by Codex, OpenCode, and Antigravity — informing the Guidance engine's per-harness translation.
