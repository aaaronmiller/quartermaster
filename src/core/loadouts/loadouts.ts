import { nowIso, stableId, type Loadout } from "../types";
import type { Repository } from "../../storage/repository";

export function createLoadout(repo: Repository, name: string, members: string[], description: string | null = null): Loadout {
  const loadout: Loadout = { id: stableId("loadout", name), name, description, members, updated_at: nowIso() };
  repo.saveLoadout(loadout);
  return loadout;
}

export function addLoadoutMember(repo: Repository, nameOrId: string, artifactId: string): Loadout {
  const existing = repo.getLoadout(nameOrId);
  if (!existing) throw new Error(`Loadout not found: ${nameOrId}`);
  const members = [...new Set([...existing.members, artifactId])];
  const updated = { ...existing, members, updated_at: nowIso() };
  repo.saveLoadout(updated);
  return updated;
}
