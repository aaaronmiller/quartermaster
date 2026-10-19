// ─────────────────────────────────────────────────────────────
// Quartermaster — Skill Discovery (D3.2)
// Level-0 discovery: metadata never bodies (C3), status is a filter not an
// index-time exclusion, disabled/archived are searchable with reason,
// superseded resolves to successor. Local first (C4), single-digit seconds (C1).
// ─────────────────────────────────────────────────────────────

import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import type { Repository } from '@storage/repository';
import type { Artifact } from '@core/types';
import type { DiscoveryQuery, DiscoveryResult, Level0Metadata, SkillStatus } from './types';
import { parseSkillMd, resolveSkillStatus } from './parse';

interface SourceMeta {
  enabled?: boolean | undefined;
  lifecycle?: string | undefined;
  supersededBy?: string | undefined;
}

const SUPERSEDED_FALLBACK: Record<string, { successor: string; reason: string }> = {
  'create_new_spec_design_project-skill': { successor: 'spec-workflow', reason: 'merged into spec-workflow gate-create' },
  spec-prep: { successor: 'spec-prep-authoring', reason: 'staged-for-deletion; successor is spec-prep-authoring/spec-prep-implementing pair' },
  'intent-archaeology': { successor: 'intent-archaeology-v1.2.1', reason: 'base source v1.2.1 is the complete lineage' },
  'mcp-builder': { successor: 'mcp-toolkit', reason: 'merged into mcp-toolkit (build+convert gates)' },
  'mcp-conversion': { successor: 'mcp-toolkit', reason: 'merged into mcp-toolkit' },
  'youtube-transcript-extraction': { successor: 'yt-transcript-obsidian-artifact', reason: 'merged, base is yt-transcript-obsidian-artifact' },
  gstack: { successor: 'gstack-agents-builds', reason: 'repo root disabled; builds win (fuller triggers, provenance marker)' },
};

function sourceMetaForFast(orgPath: string): SourceMeta {
  if (orgPath.includes('gstack.bak-20260829') || orgPath.includes('staged-for-deletion')) {
    return { enabled: false, lifecycle: 'archived' };
  }
  if (orgPath.startsWith('third-party/gstack/') && !orgPath.startsWith('third-party/gstack-agents-builds')) {
    return { enabled: false, lifecycle: 'deprecated' };
  }
  return { enabled: true, lifecycle: 'active' };
}

type StatesMap = Map<string, { status: string; reason: string | null; supersededBy: string | null }>;

function loadStatesMap(repo: Repository): StatesMap {
  const rows = repo.db.prepare('SELECT artifactId, status, reason, supersededBy FROM skill_states').all() as Array<{
    artifactId: string;
    status: string;
    reason: string | null;
    supersededBy: string | null;
  }>;
  const m = new Map<string, { status: string; reason: string | null; supersededBy: string | null }>();
  for (const r of rows) m.set(r.artifactId, { status: r.status, reason: r.reason, supersededBy: r.supersededBy });
  return m;
}

export function artifactToLevel0(artifact: Artifact, repo: Repository, statesMap?: StatesMap): Level0Metadata {
  const meta = artifact.metadata as Record<string, unknown>;
  const name = (typeof meta.name === 'string' ? meta.name : artifact.name) ?? artifact.name;
  const rawDesc = typeof meta.description === 'string' ? meta.description : artifact.name;
  const oneLine = rawDesc.replace(/\s+/g, ' ').trim().slice(0, 220);
  const triggers: string[] = [];
  const quoted = rawDesc.matchAll(/"([^"]{3,80})"/g);
  for (const mm of quoted) if (mm[1]) triggers.push(mm[1].trim().toLowerCase());
  const single = rawDesc.matchAll(/'([^']{3,80})'/g);
  for (const mm of single) if (mm[1]) triggers.push(mm[1].trim().toLowerCase());
  const uniqTriggers = [...new Set(triggers)].slice(0, 20);
  const costHint = rawDesc.toLowerCase().includes('always') || rawDesc.toLowerCase().includes('automatic') ? 'always' as const : 'on-demand' as const;
  const sourceId = artifact.organizationalPath.split('/')[0] ?? 'unknown';
  let status: SkillStatus = 'active';
  let statusReason: string | undefined;
  let supersededBy: string | undefined;

  const map = statesMap ?? loadStatesMap(repo);
  const stateRow = map.get(artifact.id);
  if (stateRow) {
    status = stateRow.status as SkillStatus;
    statusReason = stateRow.reason ?? undefined;
    supersededBy = stateRow.supersededBy ?? undefined;
  } else {
    const srcMeta = sourceMetaForFast(artifact.organizationalPath);
    const resolved = resolveSkillStatus(artifact.organizationalPath, srcMeta.enabled, srcMeta.lifecycle);
    status = resolved.status;
    statusReason = resolved.reason;
    const fb = SUPERSEDED_FALLBACK[name];
    if (fb) {
      status = 'superseded';
      supersededBy = fb.successor;
      statusReason = fb.reason;
    }
  }

  return {
    name,
    description: oneLine,
    triggers: uniqTriggers,
    status,
    statusReason,
    supersededBy,
    costHint,
    organizationalPath: artifact.organizationalPath,
    artifactId: artifact.id,
    sourceId,
    path: artifact.path,
  };
}

function scoreMatch(l0: Level0Metadata, query: DiscoveryQuery): number {
  let score = 0;
  const q = (query.text ?? query.capability ?? '').toLowerCase();
  if (!q) return 0;
  const qTokens = q.split(/\s+/).filter(Boolean);
  const triggerText = l0.triggers.join(' ').toLowerCase();
  for (const qt of qTokens) {
    if (l0.name.toLowerCase().includes(qt)) score += 10;
    if (triggerText.includes(qt)) score += 6;
    if (l0.description.toLowerCase().includes(qt)) score += 2;
    if (query.capability && l0.triggers.some((t) => t.includes(qt))) score += 4;
  }
  if (l0.costHint === 'cheap' || l0.costHint === 'on-demand') score += 0.5;
  if (l0.status === 'superseded') score -= 1;
  if (l0.status === 'archived') score -= 2;
  return score;
}

export function discoverySearch(repo: Repository, query: DiscoveryQuery): DiscoveryResult {
  const start = Date.now();
  const includeDisabled = query.includeDisabled ?? true;
  const includeArchived = query.includeArchived ?? true;

  let artifacts = repo.listArtifacts().filter((a) => a.type === 'skill');
  const statesMap = loadStatesMap(repo);

  if (query.capability) {
    const capLower = query.capability.toLowerCase();
    artifacts = artifacts.filter((a) => {
      const l0 = artifactToLevel0(a, repo, statesMap);
      return l0.triggers.some((t) => t.includes(capLower)) || l0.description.toLowerCase().includes(capLower) || l0.name.toLowerCase().includes(capLower);
    });
  }

  let level0s = artifacts.map((a) => artifactToLevel0(a, repo, statesMap));

  if (!includeDisabled) level0s = level0s.filter((l) => l.status !== 'disabled');
  if (!includeArchived) level0s = level0s.filter((l) => l.status !== 'archived' && l.status !== 'superseded');
  if (query.status) {
    const wanted = Array.isArray(query.status) ? query.status : [query.status];
    level0s = level0s.filter((l) => wanted.includes(l.status));
  }

  if (query.text) {
    const scored = level0s
      .map((l) => ({ l0: l, score: scoreMatch(l, query) }))
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score || a.l0.name.localeCompare(b.l0.name));
    level0s = scored.map((s) => s.l0);
  } else {
    level0s = level0s.sort((a, b) => a.name.localeCompare(b.name) || a.artifactId.localeCompare(b.artifactId));
  }

  const total = level0s.length;
  const offset = query.offset ?? 0;
  const limit = Math.min(query.limit ?? 50, 200);
  const sliced = level0s.slice(offset, offset + limit);
  const elapsedMs = Date.now() - start;

  try {
    const id = `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    repo.db
      .prepare('INSERT OR IGNORE INTO skill_queries_log (id, queryText, capability, resultCount, elapsedMs, createdAt) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, query.text ?? null, query.capability ?? null, sliced.length, elapsedMs, new Date().toISOString());
  } catch {
    // ignore
  }

  return { query, total, returned: sliced.length, elapsedMs, results: sliced };
}

export function resolveSkill(repo: Repository, ref: string): Level0Metadata | null {
  const artifacts = repo.listArtifacts().filter((a) => a.type === 'skill');
  const lower = ref.toLowerCase();
  const statesMap = loadStatesMap(repo);
  const candidate =
    artifacts.find((a) => a.id === ref) ??
    artifacts.find((a) => a.name.toLowerCase() === lower) ??
    artifacts.find((a) => a.organizationalPath.toLowerCase() === lower) ??
    artifacts.find((a) => basename(a.path).toLowerCase() === lower) ??
    artifacts.find((a) => a.name.toLowerCase().includes(lower));
  if (!candidate) return null;
  const l0 = artifactToLevel0(candidate, repo, statesMap);
  if (l0.status === 'superseded' && l0.supersededBy) {
    const successor = artifacts.find((a) => a.name.toLowerCase() === l0.supersededBy!.toLowerCase());
    if (successor) return artifactToLevel0(successor, repo, statesMap);
    const fb = SUPERSEDED_FALLBACK[l0.name];
    if (fb) {
      const succ = artifacts.find((a) => a.name === fb.successor);
      if (succ) return artifactToLevel0(succ, repo, statesMap);
    }
  }
  return l0;
}

export function getLevel1(repo: Repository, artifactId: string): { body: string; frontmatter: Record<string, unknown> } | null {
  const artifact = repo.getArtifact(artifactId);
  if (!artifact) return null;
  const parsed = parseSkillMd(artifact.path);
  if (!parsed) return null;
  return { body: parsed.body, frontmatter: parsed.frontmatter };
}

export function getLevel2(repo: Repository, artifactId: string): { references: string[]; scripts: string[]; assets: string[]; missingTargets: string[] } | null {
  const artifact = repo.getArtifact(artifactId);
  if (!artifact) return null;
  const parsed = parseSkillMd(artifact.path);
  if (!parsed) return null;
  const base = artifact.path.replace(/\/SKILL\.md$/i, '');
  const missing: string[] = [];
  for (const r of [...parsed.references, ...parsed.scripts, ...parsed.assets]) {
    const full = `${base}/${r}`;
    try {
      const exists = existsSync(full) || existsSync(`${base}/${r.split('/')[0]}`);
      if (!exists) missing.push(r);
    } catch {
      missing.push(r);
    }
  }
  return { references: parsed.references, scripts: parsed.scripts, assets: parsed.assets, missingTargets: missing };
}
