// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm list` / `qm search` (FR-006)
// Search and filter the catalog by type, capability, source,
// organizational path, and free text.
// ─────────────────────────────────────────────────────────────

import { searchCatalog } from '@core/catalog/search';
import type { SearchQuery } from '@core/catalog/search';
import { loadConfig } from '@core/config/load';
import type { ArtifactType } from '@core/types';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, success } from '../output';
import type { ParsedArgs } from '../output';

function buildQuery(args: ParsedArgs): SearchQuery {
  const q: SearchQuery = {};
  if (typeof args.flags.type === 'string') q.type = args.flags.type as ArtifactType;
  if (typeof args.flags.capability === 'string') q.capability = args.flags.capability;
  if (typeof args.flags.source === 'string') {
    q.source = args.flags.source as 'github' | 'git' | 'marketplace' | 'local';
  }
  if (typeof args.flags.path === 'string') q.path = args.flags.path;
  // Free text comes from a positional arg (`qm search <text>`) or --text.
  const text = typeof args.flags.text === 'string' ? args.flags.text : args.positional[0];
  if (text) q.text = text;
  return q;
}

export function listCommand(args: ParsedArgs): OutputEnvelope {
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const results = searchCatalog(repo, buildQuery(args));
    return success('list', {
      count: results.length,
      artifacts: results.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        organizationalPath: a.organizationalPath,
        capabilities: a.capabilities.map((c) => c.type),
      })),
    });
  } finally {
    repo.close();
  }
}
