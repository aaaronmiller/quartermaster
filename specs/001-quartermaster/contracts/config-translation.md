---
date: 2026-06-28
ver: 2.0.0
title: Config Translation Contract
tags: [contract, config, translation, mcp]
---

# Config Translation Contract

> Specification for translating canonical configuration formats into per-harness target formats.

## Canonical MCP Server Definition

```typescript
interface McpServerDef {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
  transport?: "stdio" | "sse" | "streamable-http";
}
```

## Translation Function

```
translate(canonical: McpServerDef, targetFormat): string
```

### Supported Target Formats

| Format ID | Harness | Output File | Output Format |
|-----------|---------|-------------|---------------|
| `claude-mcp-json` | Claude Code | `.mcp.json` | JSON object with `mcpServers` key |
| `codex-toml` | Codex | `config.toml` | TOML table under `[mcp_servers]` |
| `antigravity-json` | Antigravity | `mcp_config.json` | JSON array of server objects |
| `opencode-json` | OpenCode | `opencode.json` | JSON object with `mcpServers` key |

### Output Shapes

#### claude-mcp-json
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "KEY": "value"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

#### codex-toml
```toml
[mcp_servers]
[mcp_servers.server-name]
command = "npx"
args = ["-y", "@modelcontextprotocol/server-filesystem"]
disabled = false

[mcp_servers.server-name.env]
KEY = "value"
```

#### antigravity-json
```json
[
  {
    "name": "server-name",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem"],
    "env": {
      "KEY": "value"
    },
    "disabled": false
  }
]
```

#### opencode-json
```json
{
  "mcpServers": {
    "server-name": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "env": {
        "KEY": "value"
      },
      "disabled": false,
      "autoApprove": []
    }
  }
}
```

## Translation Contract

1. `translate()` SHALL accept a canonical `McpServerDef` and a valid target format string
2. Each output SHALL be parseable back by the respective target's config parser
3. Each output SHALL be validated (parsed back and checked for structural correctness) before the deployment plan records the op
4. Unknown fields in the canonical definition SHALL be omitted from the output but MUST NOT cause a translation error
5. If the target format does not support a field present in the canonical definition (e.g., `autoApprove` in antigravity-json), that field SHALL be silently dropped
6. Null or undefined fields in the canonical definition SHALL be omitted from the output

## Round-Trip Validation

Each translator MUST validate its output before the op is committed:

```
validateTranslation(output: string, targetFormat: string): boolean
  - Parse output using the target's config parser
  - Verify structural correctness
  - Return true if valid, false if translation produced unparseable output
```

On validation failure, the deployment plan SHALL report the translation as failed and skip the op, applying other ops normally.
