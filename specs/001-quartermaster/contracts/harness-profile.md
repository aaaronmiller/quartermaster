---
date: 2026-06-28
ver: 2.0.0
title: Harness Profile Contract
tags: [contract, harness, profile, yaml]
---

# Harness Profile Contract

> Declarative YAML-based harness profile format for describing deployment target capabilities and layout conventions.

## Schema

```yaml
id: <string>                          # Unique identifier
name: <string>                        # Human-readable name

supports:
  types: [<artifact-type>, ...]       # Supported artifact types
  capabilities:                       # Runtime capabilities with dialect
    <capability-id>:
      dialect: <dialect-id>           # Capability dialect identifier

layout:
  <artifact-type>:                    # Type-specific layout rules
    scope:
      global: <path>                  # Global installation path
      project: <path>                 # Project-scoped installation path
    dirname: <string>                 # Directory name for this type
    flat: <boolean>                   # Whether flat layout is required
    format: <config-format>           # Configuration format identifier
```

## Artifact Types

- `skill` — Agent skill (SKILL.md based)
- `plugin` — Plugin artifact with manifest
- `agent` — Agent definition
- `hook` — Runtime hook/event handler
- `mcp` — MCP server configuration
- `command` — Slash command definition
- `output_style` — Output formatting style
- `script` — Executable script

## Built-in Profiles

### Claude Code

```yaml
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

### Codex

```yaml
id: codex
name: Codex
supports:
  types: [skill, agent, hook, mcp, command]
  capabilities:
    hooks: { dialect: codex }
    mcp:   { dialect: codex-toml }
layout:
  skill:
    scope:   { global: "~/.codex/skills", project: ".codex/skills" }
    dirname: skills
    flat:    true
  mcp:
    scope:   { global: "~/.codex/config.toml" }
    format:  codex-toml
  hook:
    scope:   { global: "~/.codex/hooks" }
    format:  codex
```

### Antigravity

```yaml
id: antigravity
name: Antigravity
supports:
  types: [skill, agent, hook, mcp, command]
  capabilities:
    hooks: { dialect: antigravity }
    mcp:   { dialect: antigravity-json }
layout:
  skill:
    scope:   { global: "~/.agents/skills", project: ".agents/skills" }
    dirname: skills
    flat:    false
  mcp:
    scope:   { global: "~/.agents/mcp_config.json" }
    format:  antigravity-json
  hook:
    scope:   { global: "~/.agents/hooks" }
    format:  antigravity
```

### OpenCode

```yaml
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

## Profile Validation Rules

1. `id` MUST be unique across all profiles
2. `supports.types` MUST contain at least one artifact type
3. Each referenced artifact type in `layout` MUST have at least a `scope.global` path
4. `layout` entries for types not listed in `supports.types` are ignored
5. `capability` dialects MAY overlap across profiles; they are compared by string equality
6. If `flat: true`, the deploy engine MUST flatten the library's nested subfolders for that type
7. The `format` field in config-type layouts drives config translation selection

## User-Defined Profiles

User-defined harnesses (pi, oh-my-pi, Hermes, ante) are authored in the same shape under the user config directory (`~/.config/quartermaster/profiles/`) and participate identically.

Example for a custom harness:
```yaml
id: pi
name: pi agent harness
supports:
  types: [skill, agent, hook, mcp]
  capabilities:
    hooks: { dialect: pi-hooks }
    mcp:   { dialect: pi-mcp }
layout:
  skill:
    scope:   { global: "~/.pi/skills", project: ".pi/skills" }
    dirname: skills
    flat:    true
  mcp:
    scope:   { global: "~/.pi/mcp.json" }
    format:  pi-mcp-json
```
