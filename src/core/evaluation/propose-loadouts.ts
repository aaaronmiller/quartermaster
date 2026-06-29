import type { Artifact, LoadoutDefinition } from '@core/types';
import type { Repository } from '@storage/repository';
import { createProposal } from './proposals';

export function proposeLoadouts(repo: Repository, artifacts: Artifact[]): ReturnType<typeof createProposal> {
  const groups = new Map<string, string[]>();
  for (const artifact of artifacts) {
    const key = typeof artifact.metadata.useCase === 'string' ? artifact.metadata.useCase : artifact.type;
    groups.set(key, [...(groups.get(key) ?? []), artifact.id]);
  }
  const loadouts: LoadoutDefinition[] = [...groups.entries()].map(([name, ids]) => ({
    name,
    harnesses: [],
    artifacts: ids,
    pipelines: [],
    active: false,
  }));
  return createProposal(repo, 'loadout', { loadouts }, 'Grouped catalog artifacts by declared use case or type.');
}
