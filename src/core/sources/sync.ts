// ─────────────────────────────────────────────────────────────
// Quartermaster — Sync Engine
// Checks upstreams, auto-updates clean artifacts, reports conflicts.
// Rate limits: GitHub API 5000 req/hr (authenticated), 60 req/hr (unauthenticated)
// ─────────────────────────────────────────────────────────────

import type { Artifact, ArtifactSource } from '@core/types';
import type { Repository } from '@storage/repository';
import { Repository as SqliteRepository } from '@storage/repository';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { gitLsRemote } from './git';
import { ImportManager } from './importers';

export interface SyncReport {
  unchanged: string[];
  /** Upstream advanced and the local artifact is unmodified (safe to update). */
  ahead: string[];
  updated: string[];
  conflicts: Array<{ artifact: string; localRevision: string; upstreamRevision: string }>;
  pinned: string[];
  errors: Array<{ artifact: string; error: string }>;
}

/** Whether an artifact has local edits since import (hash vs recorded import hash). */
export function isLocallyModified(artifact: Artifact): boolean {
  const importedHash = artifact.metadata?.importedHash as string | undefined;
  if (importedHash) return artifact.hash !== importedHash;
  return artifact.localModifications === true;
}

export function isPinned(artifact: Artifact): boolean {
  return Boolean(artifact.pinnedRevision || artifact.source?.pinnedRevision);
}

/**
 * Read-only upstream currency check (FR-012). Classifies each remote artifact as
 * unchanged / ahead / conflict / pinned. Performs NO disk or catalog writes.
 */
export async function checkUpstreams(repo: Repository): Promise<SyncReport> {
  const report: SyncReport = { unchanged: [], ahead: [], updated: [], conflicts: [], pinned: [], errors: [] };

  for (const artifact of repo.listArtifacts()) {
    try {
      if (
        !artifact.source ||
        artifact.source.kind === 'local' ||
        artifact.source.kind === 'self' ||
        artifact.source.kind === 'marketplace'
      ) {
        report.unchanged.push(artifact.id);
        continue;
      }
      if (isPinned(artifact)) {
        report.pinned.push(artifact.id);
        continue;
      }

      const upstreamRef = await fetchUpstreamRef(artifact.source);
      if (!upstreamRef) {
        report.errors.push({ artifact: artifact.id, error: 'could not fetch upstream ref' });
        continue;
      }

      const currentRef = artifact.metadata?.gitRef as string | undefined;
      if (currentRef && currentRef === upstreamRef) {
        report.unchanged.push(artifact.id);
      } else if (isLocallyModified(artifact)) {
        report.conflicts.push({
          artifact: artifact.id,
          localRevision: currentRef ?? 'unknown',
          upstreamRevision: upstreamRef,
        });
      } else {
        report.ahead.push(artifact.id);
      }
    } catch (err) {
      report.errors.push({ artifact: artifact.id, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return report;
}

export async function syncUpstreams(
  repo: Repository,
  _importer: ImportManager,
  opts?: { confirm?: boolean },
): Promise<SyncReport> {
  const artifacts = repo.listArtifacts();
  const report: SyncReport = {
    unchanged: [],
    ahead: [],
    updated: [],
    conflicts: [],
    pinned: [],
    errors: [],
  };

  for (const artifact of artifacts) {
    try {
      if (
        !artifact.source ||
        artifact.source.kind === 'local' ||
        artifact.source.kind === 'self' ||
        artifact.source.kind === 'marketplace'
      ) {
        report.unchanged.push(artifact.id);
        continue;
      }

      if (isPinned(artifact)) {
        report.pinned.push(artifact.id);
        continue;
      }

      // Rate limit: delay between GitHub API calls
      if (artifact.source.kind === 'github') {
        await new Promise((r) => setTimeout(r, 100)); // 10 req/s max
      }

      const upstreamRef = await fetchUpstreamRef(artifact.source);
      const currentRef = artifact.metadata?.gitRef as string | undefined;

      if (!upstreamRef) {
        report.errors.push({ artifact: artifact.id, error: 'Could not fetch upstream ref' });
        continue;
      }

      if (currentRef && currentRef === upstreamRef) {
        report.unchanged.push(artifact.id);
        continue;
      }

      // Locally modified + upstream advanced = conflict. Never overwrite a local
      // edit without explicit confirmation (FR-013).
      if (isLocallyModified(artifact) && opts?.confirm !== true) {
        report.conflicts.push({
          artifact: artifact.id,
          localRevision: currentRef ?? 'unknown',
          upstreamRevision: upstreamRef,
        });
        continue;
      }

      const updatedArtifact = await refreshArtifactFromSource(artifact, upstreamRef);
      repo.upsertArtifact(updatedArtifact);
      report.updated.push(artifact.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push({ artifact: artifact.id, error: msg });
    }
  }

  return report;
}

async function refreshArtifactFromSource(artifact: Artifact, upstreamRef: string): Promise<Artifact> {
  const tempRoot = await fs.mkdtemp(join(tmpdir(), 'quartermaster-sync-'));
  const tempRepo = new SqliteRepository({ dbPath: join(tempRoot, 'catalog.sqlite') });
  try {
    const manager = new ImportManager(tempRepo);
    const result = await manager.importFromSource({
      source: artifact.source,
      targetDir: join(tempRoot, 'import'),
    });
    const replacement = findReplacementArtifact(artifact, result.added);
    if (!replacement) {
      throw new Error(`could not find refreshed artifact matching ${artifact.name}`);
    }

    await fs.mkdir(dirname(artifact.path), { recursive: true });
    await fs.copyFile(replacement.path, artifact.path);

    return {
      ...artifact,
      id: replacement.id,
      hash: replacement.hash,
      size: replacement.size,
      metadata: {
        ...replacement.metadata,
        importedHash: replacement.hash,
        gitRef: upstreamRef,
      },
      source: {
        ...artifact.source,
        importedRevision: upstreamRef,
      } as ArtifactSource,
      provenance: replacement.provenance,
      localModifications: false,
      updatedAt: new Date().toISOString(),
    };
  } finally {
    tempRepo.close();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

function findReplacementArtifact(original: Artifact, candidates: Artifact[]): Artifact | null {
  const originalName = basename(original.path);
  return (
    candidates.find(
      (candidate) =>
        candidate.type === original.type &&
        candidate.organizationalPath === original.organizationalPath &&
        basename(candidate.path) === originalName,
    ) ??
    candidates.find((candidate) => candidate.type === original.type && candidate.name === original.name) ??
    (candidates.filter((candidate) => candidate.type === original.type).length === 1
      ? candidates.find((candidate) => candidate.type === original.type)
      : null) ??
    null
  );
}


/**
 * Resolve the current upstream revision for a source (FR-012) via `git ls-remote`
 * — no API token, no rate limit, uniform across git hosts. `marketplace`/`local`
 * have no upstream ref.
 */
async function fetchUpstreamRef(source: ArtifactSource): Promise<string | null> {
  switch (source.kind) {
    case 'git':
      return gitLsRemote(source.url, source.ref || 'HEAD');
    case 'git_subdir':
      return gitLsRemote(source.url, source.ref || 'HEAD');
    case 'github':
      return gitLsRemote(`https://github.com/${source.owner}/${source.repo}`, source.ref || 'HEAD');
    default:
      return null;
  }
}
