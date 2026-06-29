// ─────────────────────────────────────────────────────────────
// Quartermaster — Optional MCP Server (FR-132)
// Exposes the SAME query operations as `qm query` over the MCP
// JSON-RPC 2.0 stdio protocol. The CLI remains the primary surface;
// this server is opt-in (enable flag) and adds no runtime dependency.
// ─────────────────────────────────────────────────────────────

import { Repository } from '@storage/repository';
import { loadConfig } from '@core/config/load';
import type { QuartermasterConfig } from '@core/config/schema';
import {
  queryArtifacts,
  queryArtifact,
  queryCompatibility,
  queryDeployment,
  querySearch,
  scaffoldArtifact,
} from '@core/query/commands';
import type { ArtifactType } from '@core/types';

const PROTOCOL_VERSION = '2024-11-05';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Tool catalog — one MCP tool per agent query operation, parity with `qm query`. */
export const MCP_TOOLS: McpTool[] = [
  {
    name: 'list_skills',
    description: 'List every catalog artifact with stable machine-readable fields.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search',
    description: 'Search artifacts by free text, type, or required capability.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        type: { type: 'string' },
        capability: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get',
    description: 'Retrieve metadata for a single artifact by id.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'audit',
    description: 'Compute compatibility verdicts for an artifact across all harness profiles.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'scaffold',
    description: 'Scaffold a new artifact stub of a given type; returns the created path.',
    inputSchema: {
      type: 'object',
      properties: { type: { type: 'string' }, path: { type: 'string' } },
      required: ['type', 'path'],
      additionalProperties: false,
    },
  },
];

/** Is the MCP server enabled? Opt-in via config or QM_MCP_ENABLED env. */
export function isMcpEnabled(
  config: QuartermasterConfig = loadConfig(),
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (env.QM_MCP_ENABLED === '1' || env.QM_MCP_ENABLED === 'true') return true;
  return config.mcp?.enabled === true;
}

export class McpToolError extends Error {}

/**
 * Dispatch a single tool call to the underlying query operation.
 * Returns the exact same data shape the CLI `qm query` commands return.
 */
export function dispatchTool(repo: Repository, name: string, args: Record<string, unknown> = {}): unknown {
  switch (name) {
    case 'list_skills':
      return queryArtifacts(repo);
    case 'search': {
      const opts: { text?: string; type?: string; capability?: string } = {};
      if (typeof args.text === 'string') opts.text = args.text;
      if (typeof args.type === 'string') opts.type = args.type;
      if (typeof args.capability === 'string') opts.capability = args.capability;
      return querySearch(repo, opts);
    }
    case 'get': {
      if (typeof args.id !== 'string') throw new McpToolError('get requires string "id"');
      const artifact = queryArtifact(repo, args.id);
      if (!artifact) throw new McpToolError(`artifact not found: ${args.id}`);
      return { artifact };
    }
    case 'audit': {
      if (typeof args.id !== 'string') throw new McpToolError('audit requires string "id"');
      const compatibility = queryCompatibility(repo, args.id);
      if (!compatibility) throw new McpToolError(`artifact not found: ${args.id}`);
      return compatibility;
    }
    case 'status': {
      const harness = typeof args.harness === 'string' ? args.harness : 'claude-code';
      return queryDeployment(repo, harness);
    }
    case 'scaffold': {
      if (typeof args.type !== 'string' || typeof args.path !== 'string') {
        throw new McpToolError('scaffold requires string "type" and "path"');
      }
      return scaffoldArtifact(args.type as ArtifactType, args.path);
    }
    default:
      throw new McpToolError(`unknown tool: ${name}`);
  }
}

export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Handle one JSON-RPC request and produce a response (or null for notifications).
 * Implements the MCP handshake (`initialize`), tool discovery (`tools/list`),
 * and tool invocation (`tools/call`).
 */
export function handleRpc(repo: Repository, request: JsonRpcRequest): JsonRpcResponse | null {
  const id = request.id ?? null;
  try {
    switch (request.method) {
      case 'initialize':
        return reply(id, {
          protocolVersion: PROTOCOL_VERSION,
          serverInfo: { name: 'quartermaster', version: '2.0.0' },
          capabilities: { tools: {} },
        });
      case 'notifications/initialized':
        return null; // notification: no response
      case 'tools/list':
        return reply(id, { tools: MCP_TOOLS });
      case 'tools/call': {
        const params = request.params ?? {};
        const name = params.name as string;
        const callArgs = (params.arguments as Record<string, unknown>) ?? {};
        const data = dispatchTool(repo, name, callArgs);
        return reply(id, { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false });
      }
      default:
        return { jsonrpc: '2.0', id, error: { code: -32601, message: `method not found: ${request.method}` } };
    }
  } catch (err) {
    return { jsonrpc: '2.0', id, error: { code: -32000, message: (err as Error).message } };
  }
}

function reply(id: string | number | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Start the MCP server reading newline-delimited JSON-RPC from stdin and writing
 * responses to stdout. No-op (returns false) when the server is not enabled.
 */
export async function startMcpServer(config: QuartermasterConfig = loadConfig()): Promise<boolean> {
  if (!isMcpEnabled(config)) return false;
  const repo = new Repository({ dbPath: config.dbPath });

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of Bun.stdin.stream()) {
    buffer += decoder.decode(chunk as Uint8Array);
    let newline: number;
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      let request: JsonRpcRequest;
      try {
        request = JSON.parse(line) as JsonRpcRequest;
      } catch {
        continue; // skip malformed line
      }
      const response = handleRpc(repo, request);
      if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
    }
  }
  repo.close();
  return true;
}
