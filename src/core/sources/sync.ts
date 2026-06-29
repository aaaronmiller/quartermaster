// ─────────────────────────────────────────────────────────────
// Quartermaster — Sync Engine
// Checks upstreams, auto-updates clean artifacts, reports conflicts.
// Rate limits: GitHub API 5000 req/hr (authenticated), 60 req/hr (unauthenticated)
// ─────────────────────────────────────────────────────────────

import type { Artifact, ArtifactSource } from '@core/types';
import type { Repository } from '@storage/repository';
import { gitLsRemote } from './git';
import type { ImportManager } from './importers';

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

/**
 * Read-only upstream currency check (FR-012). Classifies each remote artifact as
 * unchanged / ahead / conflict / pinned. Performs NO disk or catalog writes.
 */
export async function checkUpstreams(repo: Repository): Promise<SyncReport> {
  const report: SyncReport = { unchanged: [], ahead: [], updated: [], conflicts: [], pinned: [], errors: [] };

  for (const artifact of repo.listArtifacts()) {
    try {
      if (!artifact.source || artifact.source.kind === 'local' || artifact.source.kind === 'marketplace') {
        report.unchanged.push(artifact.id);
        continue;
      }
      if (artifact.pinnedRevision) {
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
  importer: ImportManager,
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
      if (!artifact.source || artifact.source.kind === 'local') {
        report.unchanged.push(artifact.id);
        continue;
      }

      if (artifact.pinnedRevision) {
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

      // Auto-update: re-import
      await importer.importFromSource({
        source: artifact.source,
        targetDir: '/tmp/quartermaster-sync',
      });

      const updatedArtifact: Artifact = {
        ...artifact,
        metadata: { ...artifact.metadata, gitRef: upstreamRef },
        updatedAt: new Date().toISOString(),
      };
      repo.upsertArtifact(updatedArtifact);
      report.updated.push(artifact.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      report.errors.push({ artifact: artifact.id, error: msg });
    }
  }

  return report;
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
    case 'github':
      return gitLsRemote(`https://github.com/${source.owner}/${source.repo}`, source.ref || 'HEAD');
    default:
      return null;
  }
}
