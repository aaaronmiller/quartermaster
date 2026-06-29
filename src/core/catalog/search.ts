// ─────────────────────────────────────────────────────────────
// Quartermaster — Catalog Search & Filter
// Builds SQL queries from structured search criteria.
// ─────────────────────────────────────────────────────────────

import type { Artifact, ArtifactType } from '@core/types';
import type { Repository } from '@storage/repository';

export interface SearchQuery {
  type?: ArtifactType | ArtifactType[];
  capability?: string | string[];
  source?: 'github' | 'git' | 'marketplace' | 'local';
  path?: string;
  text?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 1000;

/**
 * Search the catalog using structured query filters.
 * Uses parameterized SQL to prevent injection.
 */
export function searchCatalog(repo: Repository, query: SearchQuery): Artifact[] {
  const conditions: string[] = [];
  const params: string[] = [];

  // Type filter
  if (query.type) {
    const types = Array.isArray(query.type) ? query.type : [query.type];
    const placeholders = types.map(() => '?').join(',');
    conditions.push(`type IN (${placeholders})`);
    params.push(...types);
  }

  // Capability filter — search within the JSON capabilities string
  if (query.capability) {
    const caps = Array.isArray(query.capability) ? query.capability : [query.capability];
    for (const c of caps) {
      conditions.push('capabilities LIKE ?');
      params.push(`%${c}%`);
    }
  }

  // Source filter — search within the JSON source string
  if (query.source) {
    conditions.push('source LIKE ?');
    params.push(`%"kind":"${query.source}"%`);
  }

  // Path subpath filter
  if (query.path) {
    conditions.push('path LIKE ?');
    params.push(`%${query.path}%`);
  }

  // Free-text search
  if (query.text) {
    const like = `%${query.text}%`;
    conditions.push('(name LIKE ? OR path LIKE ? OR metadata LIKE ?)');
    params.push(like, like, like);
  }

  // Tags filter — for skills, tags are stored in metadata JSON
  if (query.tags && query.tags.length > 0) {
    for (const tag of query.tags) {
      conditions.push('metadata LIKE ?');
      params.push(`%"tags"%${tag}%`);
    }
  }

  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const offset = query.offset ?? 0;

  let sql = 'SELECT * FROM artifacts';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY name ASC LIMIT ? OFFSET ?';
  params.push(String(limit), String(offset));

  const rows = repo.queryRaw(sql, params) as Record<string, unknown>[];
  return rows.map(rowToArtifact);
}

/**
 * Count total artifacts matching a search query (without pagination).
 */
export function countCatalog(repo: Repository, query: SearchQuery): number {
  const conditions: string[] = [];
  const params: string[] = [];

  if (query.type) {
    const types = Array.isArray(query.type) ? query.type : [query.type];
    const placeholders = types.map(() => '?').join(',');
    conditions.push(`type IN (${placeholders})`);
    params.push(...types);
  }

  if (query.capability) {
    const caps = Array.isArray(query.capability) ? query.capability : [query.capability];
    for (const c of caps) {
      conditions.push('capabilities LIKE ?');
      params.push(`%${c}%`);
    }
  }

  if (query.text) {
    const like = `%${query.text}%`;
    conditions.push('(name LIKE ? OR path LIKE ? OR metadata LIKE ?)');
    params.push(like, like, like);
  }

  let sql = 'SELECT COUNT(*) as cnt FROM artifacts';
  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  const row = repo.queryRow<{ cnt: number }>(sql, params);
  return row?.cnt ?? 0;
}

// ─── Row mapping ───────────────────────────────────────────

function rowToArtifact(row: Record<string, unknown>): Artifact {
  return {
    id: row.id as string,
    type: row.type as Artifact['type'],
    name: row.name as string,
    path: row.path as string,
    organizationalPath: (row.organizationalPath as string) ?? '',
    hash: row.hash as string,
    size: row.size as number,
    metadata: safeParse(row.metadata as string | null, {}),
    source: safeParse(row.source as string, { kind: 'local', path: '' }),
    capabilities: safeParse(row.capabilities as string, []),
    importedAt: row.importedAt as string,
    updatedAt: row.updatedAt as string,
    provenance: (row.provenance as string) ?? '',
    pinnedRevision: (row.pinnedRevision as string) ?? undefined,
    localModifications: (row.localModifications as number) === 1,
  };
}

function safeParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
