// ─────────────────────────────────────────────────────────────
// Quartermaster — Config Format Writers
// Converts canonical MCP server definitions to JSON, YAML,
// and TOML formats for harness interfaces.
// ─────────────────────────────────────────────────────────────

import yaml from 'js-yaml';
import { stringify as tomlStringify } from 'smol-toml';

export type ConfigFormat = 'json' | 'yaml' | 'toml';

export interface McpServerDef {
  name: string;
  type: 'mcp-server';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'sse';
  url?: string;
}

/**
 * Write an MCP server definition to the specified format.
 */
export function writeConfig(config: McpServerDef, format: ConfigFormat): string {
  switch (format) {
    case 'json':
      return writeJson(config);
    case 'yaml':
      return writeYaml(config);
    case 'toml':
      return writeToml(config);
    default: {
      const _exhaustive: never = format;
      throw new ConfigWriterError(`Unknown format: ${_exhaustive}`);
    }
  }
}

/**
 * Validate that a string parses correctly in the given format.
 */
export function validateConfig(content: string, format: ConfigFormat): boolean {
  try {
    switch (format) {
      case 'json':
        JSON.parse(content);
        return true;
      case 'yaml':
        yaml.load(content);
        return true;
      case 'toml': {
        const { parse } = require('smol-toml');
        parse(content);
        return true;
      }
      default:
        return false;
    }
  } catch {
    return false;
  }
}

// ─── Format Writers ─────────────────────────────────────────

function writeJson(config: McpServerDef): string {
  const obj: Record<string, unknown> = {
    ...config,
  };
  // Remove empty fields
  if (!obj.env || Object.keys(obj.env as Record<string, string>).length === 0) {
    delete obj.env;
  }
  if (!obj.args || (obj.args as string[]).length === 0) {
    delete obj.args;
  }
  if (!obj.url) delete obj.url;
  if (!obj.command) delete obj.command;

  return JSON.stringify(obj, null, 2);
}

function writeYaml(config: McpServerDef): string {
  const obj: Record<string, unknown> = {
    name: config.name,
    type: config.type,
    transport: config.transport,
  };

  if (config.command) obj.command = config.command;
  if (config.args && config.args.length > 0) obj.args = config.args;
  if (config.env && Object.keys(config.env).length > 0) obj.env = config.env;
  if (config.url) obj.url = config.url;
  if (config.transport === 'sse' && !config.url) {
    obj.url = 'http://localhost:3000/sse';
  }

  return yaml.dump(obj, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: true,
  });
}

function writeToml(config: McpServerDef): string {
  const obj: Record<string, unknown> = {
    name: config.name,
    type: config.type,
    transport: config.transport,
  };

  if (config.command) obj.command = config.command;
  if (config.args && config.args.length > 0) obj.args = config.args;
  if (config.env && Object.keys(config.env).length > 0) {
    obj.env = config.env;
  }
  if (config.url) obj.url = config.url;

  return tomlStringify(obj);
}

export class ConfigWriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigWriterError';
  }
}
