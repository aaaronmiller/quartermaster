// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm new <type> <path>`
// Scaffold self-authored artifacts inside the library.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import type { ArtifactType } from '@core/types';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function newCommand(args: ParsedArgs): OutputEnvelope {
  const type = args.positional[0] as ArtifactType | undefined;
  const rawPath = args.positional[1];
  if (!type || !rawPath) return failure('new', 'usage: qm new <type> <path>');
  const content = templateFor(type, rawPath);
  if (!content.ok) return failure('new', content.reason);

  const cfg = loadConfig();
  const target = isAbsolute(rawPath) ? rawPath : join(cfg.roots[0] ?? process.cwd(), rawPath);
  if (existsSync(target)) return failure('new', `target already exists: ${target}`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content.content);
  return success('new', { type, path: target });
}

function templateFor(
  type: ArtifactType,
  path: string,
): { ok: true; content: string } | { ok: false; reason: string } {
  const baseName = path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'artifact';
  switch (type) {
    case 'skill':
      return {
        ok: true,
        content: `---\nname: ${baseName}\ndescription: Self-authored skill\nversion: 0.1.0\n---\n# ${baseName}\n`,
      };
    case 'plugin':
      return { ok: true, content: `name: ${baseName}\ndescription: Self-authored plugin\n` };
    case 'agent':
      return { ok: true, content: `name: ${baseName}\ndescription: Self-authored agent\n` };
    case 'hook':
      return { ok: true, content: `name: ${baseName}\ndialect: claude\n` };
    case 'mcp-config':
      return { ok: true, content: JSON.stringify({ name: baseName, mcpServers: {} }, null, 2) };
    case 'slash-command':
      return { ok: true, content: `---\nname: ${baseName}\n---\n# ${baseName}\n` };
    case 'output-style':
      return { ok: true, content: `---\nname: ${baseName}\n---\n# ${baseName}\n` };
    case 'script':
      return { ok: true, content: '#!/usr/bin/env bash\nset -euo pipefail\n' };
    default:
      return { ok: false, reason: `unsupported artifact type: ${type}` };
  }
}
