// ─────────────────────────────────────────────────────────────
// Quartermaster — Sync Engine
// Checks upstreams, auto-updates clean artifacts, reports conflicts.
// Rate limits: GitHub API 5000 req/hr (authenticated), 60 req/hr (unauthenticated)
// ─────────────────────────────────────────────────────────────

import type { Artifact, ArtifactSource } from '@core/types';
import type { Repository } from '@storage/repository';
import { gitFetch } from './git';
import type { ImportManager } from './importers';

export interface SyncReport {
  unchanged: string[];
  updated: string[];
  conflicts: Array<{ artifact: string; localRevision: string; upstreamRevision: string }>;
  pinned: string[];
  errors: Array<{ artifact: string; error: string }>;
}

export async function syncUpstreams(
  repo: Repository,
  importer: ImportManager,
): Promise<SyncReport> {
  const artifacts = repo.listArtifacts();
  const report: SyncReport = {
    unchanged: [],
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

      if (artifact.localModifications) {
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

async function fetchUpstreamRef(source: ArtifactSource): Promise<string | null> {
  switch (source.kind) {
    case 'git':
      // Would need local clone path
      return null;
    case 'github':
      // Would call GitHub API: GET /repos/{owner}/{repo}/commits/{ref}
      // Rate limited: 5000/hr authenticated, 60/hr unauthenticated
      return null;
    default:
      return null;
  }
}
