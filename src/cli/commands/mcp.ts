// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm mcp` (FR-132)
// Starts the optional MCP query server. CLI remains primary; the
// server only runs when enabled via config or QM_MCP_ENABLED.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { MCP_TOOLS, isMcpEnabled, startMcpServer } from '../../mcp/server';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export async function mcpCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const [sub] = args.positional;
  const cfg = loadConfig();
  const enabled = isMcpEnabled(cfg);

  if (sub === 'status' || sub === undefined) {
    return success('mcp', { enabled, tools: MCP_TOOLS.map((t) => t.name) });
  }

  if (sub === 'serve' || sub === 'start') {
    if (!enabled) {
      return failure('mcp', 'MCP server disabled. Enable with `qm config set mcp.enabled true` or QM_MCP_ENABLED=1.');
    }
    // Blocking: reads JSON-RPC from stdin until EOF.
    await startMcpServer(cfg);
    return success('mcp', { stopped: true });
  }

  return failure('mcp', 'usage: qm mcp status|serve');
}
