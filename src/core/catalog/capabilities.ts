// ─────────────────────────────────────────────────────────────
// Quartermaster — Capability Inference
// Maps each artifact type to declared runtime capabilities.
// ─────────────────────────────────────────────────────────────

import type { Artifact, Capability } from '@core/types';

/**
 * Infer capabilities for a single artifact based on its type
 * and parsed metadata.
 */
export function inferCapabilities(artifact: Artifact): Capability[] {
  switch (artifact.type) {
    case 'skill':
      return inferSkillCapabilities(artifact);
    case 'plugin':
      return inferPluginCapabilities(artifact);
    case 'hook':
      return [{ type: 'hooks', dialect: (artifact.metadata?.dialect as string) ?? 'claude' }];
    case 'mcp-config':
      return inferMcpCapabilities(artifact);
    case 'script':
      return [{ type: 'scripts', dialect: detectScriptDialect(artifact.path) }];
    case 'agent':
      return [{ type: 'agent-config', dialect: 'generic' }];
    case 'slash-command':
      return [{ type: 'commands', dialect: 'agent' }];
    case 'output-style':
      return [{ type: 'output-style', dialect: 'generic' }];
    default:
      return [];
  }
}

/**
 * Infer capability dialect for a specific capability type on an artifact.
 */
export function inferCapabilityDialect(artifact: Artifact, capabilityType: string): string {
  const caps = inferCapabilities(artifact);
  const match = caps.find((c) => c.type === capabilityType);
  return match?.dialect ?? 'generic';
}

/**
 * Union capabilities from a plugin's parsed manifest components.
 */
export function unionPluginCapabilities(manifest: Record<string, unknown>): Capability[] {
  const components = (manifest.components as Array<{ type: string }>) ?? [];
  const caps: Capability[] = [];

  for (const comp of components) {
    switch (comp.type) {
      case 'hook':
        caps.push({ type: 'hooks', dialect: 'plugin' });
        break;
      case 'command':
        caps.push({ type: 'commands', dialect: 'plugin' });
        break;
      case 'mcp':
        caps.push({ type: 'mcp', dialect: 'plugin' });
        break;
      case 'skill':
        caps.push({ type: 'skill', dialect: 'plugin-managed' });
        break;
      default:
        caps.push({ type: comp.type || 'unknown', dialect: 'plugin' });
    }
  }

  // Top-level capability declarations — a plugin may bundle a hook/mcp/command
  // via a dedicated key rather than a `components[]` entry (FR-004). Detect both,
  // biasing toward over-declaring (see design/capability-inference.md).
  const has = (t: string) => caps.some((c) => c.type === t);
  if (manifest.hooks && !has('hooks')) {
    const hooks = manifest.hooks as { dialect?: string };
    caps.push({ type: 'hooks', dialect: hooks?.dialect ?? 'plugin' });
  }
  if ((manifest.mcp || manifest.mcpServers) && !has('mcp')) {
    caps.push({ type: 'mcp', dialect: 'plugin' });
  }
  if (manifest.commands && !has('commands')) {
    caps.push({ type: 'commands', dialect: 'plugin' });
  }

  if (caps.length === 0) {
    caps.push({ type: 'plugin', dialect: 'generic' });
  }

  return caps;
}

// ─── Type-specific inference ────────────────────────────────

function inferSkillCapabilities(artifact: Artifact): Capability[] {
  const caps: Capability[] = [{ type: 'skill', dialect: 'agent-md' }];

  const grade = artifact.metadata?.grade as string | undefined;
  if (grade && grade.toUpperCase() === 'A') {
    caps.push({ type: 'quality-assured', dialect: 'agent-md' });
  }

  // Frontmatter 'requires' field can override/append
  const requires = artifact.metadata?.requires as string[] | undefined;
  if (requires && Array.isArray(requires)) {
    for (const req of requires) {
      if (!caps.some((c) => c.type === req)) {
        caps.push({ type: req, dialect: 'agent-md' });
      }
    }
  }

  return caps;
}

function inferPluginCapabilities(artifact: Artifact): Capability[] {
  const manifest = artifact.metadata as Record<string, unknown>;
  return unionPluginCapabilities(manifest);
}

function inferMcpCapabilities(artifact: Artifact): Capability[] {
  const mcpType = artifact.metadata?.mcpType as string | undefined;
  return [
    {
      type: 'mcp',
      dialect:
        mcpType === 'multi' ? 'multi-server' : mcpType === 'single' ? 'single-server' : 'generic',
      metadata: { transport: 'stdio' },
    },
  ];
}

function detectScriptDialect(_path: string): string {
  // Simple extension-based detection
  if (_path.endsWith('.py')) return 'python';
  if (_path.endsWith('.sh')) return 'bash';
  if (_path.endsWith('.js') || _path.endsWith('.ts')) return 'node';
  return 'generic';
}
