// ─────────────────────────────────────────────────────────────
// Quartermaster — Loadout Vetted Query (D3.6)
// "Is this vetted" answered from data rather than by asking the human.
// A recorded past failure was an agent escalating a question whose answer
// was already in the loadout.
// ─────────────────────────────────────────────────────────────

import type { Repository } from '@storage/repository';
import { LoadoutManager } from '@core/loadouts/loadouts';
import type { Level0Metadata } from './types';
import { discoverySearch } from './discovery';

export interface VettedResult {
  skill: string;
  artifactId: string | null;
  vetted: boolean;
  activeLoadout: string | null;
  loadoutsContaining: string[];
  reason: string;
}

export function isVetted(repo: Repository, skillRef: string): VettedResult {
  const normalized = skillRef.toLowerCase().trim();
  // Resolve to Level0 first
  const search = discoverySearch(repo, { text: normalized, limit: 50 });
  const match = search.results.find((r) => r.name.toLowerCase() === normalized) ?? search.results[0] ?? null;

  const manager = new LoadoutManager(repo);
  const allLoadouts = manager.list();

  if (!match) {
    return {
      skill: skillRef,
      artifactId: null,
      vetted: false,
      activeLoadout: null,
      loadoutsContaining: [],
      reason: `skill '${skillRef}' not found in catalog — cannot be vetted`,
    };
  }

  const containing = allLoadouts.filter((l) => l.artifacts.includes(match.artifactId)).map((l) => l.name);
  const activeContaining = allLoadouts.filter((l) => l.active && l.harnesses.length > 0 && l.artifacts.includes(match.artifactId)).map((l) => `${l.name} (harnesses: ${l.harnesses.join(',')})`);

  // Vetted = in any active loadout (the vetted set)
  const vetted = activeContaining.length > 0;
  const activeLoadout = activeContaining[0]?.split(' ')[0] ?? containing[0] ?? null;

  return {
    skill: skillRef,
    artifactId: match.artifactId,
    vetted,
    activeLoadout,
    loadoutsContaining: containing,
    reason: vetted
      ? `skill '${match.name}' is vetted: in active loadout(s) ${activeContaining.join(', ')}`
      : containing.length > 0
        ? `skill '${match.name}' is not vetted: in loadout(s) ${containing.join(', ')} but none active`
        : `skill '${match.name}' is not vetted: not in any loadout`,
  };
}
