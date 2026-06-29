// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm sync --check`
// Reports upstream currency without writing to disk or catalog.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { ImportManager } from '@core/sources/importers';
import { checkUpstreams, syncUpstreams } from '@core/sources/sync';
import { Repository } from '@storage/repository';
import type { Artifact, ArtifactSource } from '@core/types';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export async function syncCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const report =
      args.flags.check === true
        ? await checkUpstreams(repo)
        : await syncUpstreams(repo, new ImportManager(repo), {
            confirm: args.flags.confirm === true || args.flags.yes === true,
          });
    return success('sync', report);
  } finally {
    repo.close();
  }
}

export function pinCommand(args: ParsedArgs): OutputEnvelope {
  const artifactKey = args.positional[0];
  const revision = args.positional[1];
  if (!artifactKey || !revision) {
    return failure('pin', 'usage: qm pin <artifact-id-or-path-or-name> <revision>');
  }

  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const artifact = findArtifact(repo, artifactKey);
    if (!artifact) return failure('pin', `artifact not found: ${artifactKey}`);
    const pinned: Artifact = {
      ...artifact,
      pinnedRevision: revision,
      source: setSourcePin(artifact.source, revision),
      updatedAt: new Date().toISOString(),
    };
    repo.upsertArtifact(pinned);
    return success('pin', { artifact: artifact.id, pinnedRevision: revision });
  } finally {
    repo.close();
  }
}

export function unpinCommand(args: ParsedArgs): OutputEnvelope {
  const artifactKey = args.positional[0];
  if (!artifactKey) return failure('unpin', 'usage: qm unpin <artifact-id-or-path-or-name>');

  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const artifact = findArtifact(repo, artifactKey);
    if (!artifact) return failure('unpin', `artifact not found: ${artifactKey}`);
    const { pinnedRevision: _artifactPin, ...artifactWithoutPin } = artifact;
    const unpinned: Artifact = {
      ...artifactWithoutPin,
      source: clearSourcePin(artifact.source),
      updatedAt: new Date().toISOString(),
    };
    repo.upsertArtifact(unpinned);
    return success('unpin', { artifact: artifact.id });
  } finally {
    repo.close();
  }
}

function findArtifact(repo: Repository, key: string): Artifact | null {
  return (
    repo.getArtifact(key) ??
    repo.getArtifactByPath(key) ??
    repo.listArtifacts().find((artifact) => artifact.name === key) ??
    null
  );
}

function setSourcePin(source: ArtifactSource, revision: string): ArtifactSource {
  return { ...source, pinnedRevision: revision } as ArtifactSource;
}

function clearSourcePin(source: ArtifactSource): ArtifactSource {
  const { pinnedRevision: _sourcePin, ...rest } = source;
  return rest as ArtifactSource;
}
