---
date: 2026-06-29 00:00:00 UTC
ver: 1.0.0
author: claude-opus
model: claude-opus-4-8
tags: [quartermaster, design, capability-inference, fr-004, spike]
---

# Spike T026a — Capability Inference Design (FR-004)

## Why this is a spike, not a checkbox

FR-004 is the spec's **Risk #1**: inference is imperfect, and a wrong capability
set produces a wrong compatibility verdict (FR-030). A missed capability is the
dangerous case — it lets an artifact deploy to a harness that cannot run it.

## Decision 1 — Single source of truth

The scanner currently assigns capabilities inline during type detection, AND
`capabilities.ts::inferCapabilities` exists but is never called. That is two
diverging sources. **Decision: the scanner delegates to `inferCapabilities`.**
Detection assigns only the *type* + parses metadata; capabilities are derived in
one place so audit and catalog agree.

## Decision 2 — Conservative default (fail safe)

When a signal is ambiguous, **over-declare** the capability rather than omit it.
Rationale: an extra capability makes a verdict *more* restrictive (artifact marked
incompatible/transform on a harness that lacks it) — a false "blocked" the
developer can override with a recorded note (FR-034). A *missing* capability makes
a verdict falsely "deployable" and ships a broken artifact silently. Bias toward
the recoverable error.

## Decision 3 — Per-type detection signals

| Type | Base capability | Extra signals → added capabilities |
|------|-----------------|-------------------------------------|
| skill | `skill/agent-md` | frontmatter `requires: [..]` → each as capability; `mcp:` ref → `mcp` |
| plugin | `plugin/generic` | manifest `components[]` AND top-level `hooks`/`mcp`/`commands`/`mcpServers` keys → corresponding capability. **A plugin bundling a hook MUST yield `hooks`** (FR-004 acceptance). |
| hook | `hooks/<dialect>` | manifest `dialect` field overrides dialect |
| mcp-config | `mcp/<single\|multi>` | array or `mcpServers` object → multi-server |
| agent | `agent-config/generic` | — |
| slash-command | `commands/<dialect>` | — |
| output-style | `output-style/generic` | — |
| script | `scripts/<lang>` | language from extension |

## Decision 4 — Dialect detection

Dialect is read from the artifact's own declaration when present (e.g. a hook's
`dialect: claude-code`), else defaulted per type. Dialects are matched against
harness profile dialects at audit time (FR-030); an unknown dialect with no
translator → `incompatible`, with a translator → `transform` (FR-032).

## Decision 5 — Confidence / override hook

Inference is heuristic. The recorded capability set is advisory input to the
verdict, and FR-034 manual override is the escape hatch when a developer has
verified behavior the heuristics cannot infer. No separate confidence score in v1;
the override mechanism carries the human correction.

## Implementation consequences (tasks that follow)

- T027–T031: route scanner → `inferCapabilities`; extend `unionPluginCapabilities`
  to read top-level `hooks`/`mcp`/`commands`/`mcpServers` keys, not just
  `components`. Add skill `mcp` reference detection.
- T032: test that the fixture plugin (which declares `hooks:`) is recorded
  requiring `hooks`, and a pure skill requires only `skill`.
