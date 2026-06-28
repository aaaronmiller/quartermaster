import { nowIso, stableId, type Artifact, type Loadout, type LoadoutAssignment } from "../types";
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

export function updateLoadoutMembers(repo: Repository, nameOrId: string, members: string[], description?: string | null): Loadout {
  const existing = repo.getLoadout(nameOrId);
  if (!existing) throw new Error(`Loadout not found: ${nameOrId}`);
  const updated = {
    ...existing,
    description: description === undefined ? existing.description ?? null : description,
    members: [...new Set(members)],
    updated_at: nowIso()
  };
  repo.saveLoadout(updated);
  return updated;
}

export function removeLoadoutMember(repo: Repository, nameOrId: string, memberId: string): Loadout {
  const existing = repo.getLoadout(nameOrId);
  if (!existing) throw new Error(`Loadout not found: ${nameOrId}`);
  const updated = { ...existing, members: existing.members.filter((member) => member !== memberId), updated_at: nowIso() };
  repo.saveLoadout(updated);
  return updated;
}

export function assignLoadout(repo: Repository, harnessId: string, loadoutNameOrId: string, active = true): LoadoutAssignment {
  const loadout = repo.getLoadout(loadoutNameOrId);
  if (!loadout) throw new Error(`Loadout not found: ${loadoutNameOrId}`);
  const assignment = { harness_id: harnessId, loadout_id: loadout.id, active, assigned_at: nowIso() };
  repo.saveLoadoutAssignment(assignment);
  return assignment;
}

export function switchLoadout(repo: Repository, harnessId: string, loadoutNameOrId: string): LoadoutAssignment {
  return assignLoadout(repo, harnessId, loadoutNameOrId, true);
}

export function copyLoadoutAssignment(repo: Repository, fromHarness: string, toHarness: string, move = false): LoadoutAssignment {
  const source = repo.getLoadoutAssignment(fromHarness);
  if (!source) throw new Error(`No loadout assignment found for harness: ${fromHarness}`);
  const copied = { ...source, harness_id: toHarness, assigned_at: nowIso() };
  repo.saveLoadoutAssignment(copied);
  if (move) repo.saveLoadoutAssignment({ ...source, active: false, assigned_at: nowIso() });
  return copied;
}

export function activeLoadoutForHarness(repo: Repository, harnessId: string): Loadout | null {
  const assignment = repo.getLoadoutAssignment(harnessId);
  if (!assignment?.active) return null;
  return repo.getLoadout(assignment.loadout_id);
}

export function resolveLoadoutArtifacts(repo: Repository, loadout: Loadout): Artifact[] {
  const memberIds = new Set(loadout.members);
  for (const member of loadout.members) {
    const pipeline = repo.getPipeline(member);
    if (pipeline) {
      for (const artifactId of pipeline.members) memberIds.add(artifactId);
    }
  }
  return repo.listArtifacts().filter((artifact) => memberIds.has(artifact.id));
}
