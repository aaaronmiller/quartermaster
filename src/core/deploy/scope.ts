import type { Artifact, Loadout } from "../types";
import type { Repository } from "../../storage/repository";
import { resolveLoadoutArtifacts } from "../loadouts/loadouts";

export function scopeArtifacts(artifacts: Artifact[], options: { loadout?: Loadout | null; path?: string | null; type?: string | null }): Artifact[] {
  let scoped = artifacts;
  if (options.loadout) {
    const ids = new Set(options.loadout.members);
    scoped = scoped.filter((artifact) => ids.has(artifact.id));
  }
  if (options.path) scoped = scoped.filter((artifact) => artifact.org_path.startsWith(options.path!));
  if (options.type) scoped = scoped.filter((artifact) => artifact.type === options.type);
  return scoped;
}

export function scopeArtifactsFromRepository(repo: Repository, options: { loadout?: Loadout | null; path?: string | null | undefined; type?: string | null | undefined }): Artifact[] {
  const artifacts = options.loadout ? resolveLoadoutArtifacts(repo, options.loadout) : repo.listArtifacts();
  return scopeArtifacts(artifacts, { loadout: null, path: options.path ?? null, type: options.type ?? null });
}
