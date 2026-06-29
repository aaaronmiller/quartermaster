// ─────────────────────────────────────────────────────────────
// Quartermaster — Loadout Manager
// Named subsets of artifacts + pipelines for scoped deployment.
// ─────────────────────────────────────────────────────────────

import type { LoadoutDefinition } from '@core/types';
import type { Repository } from '@storage/repository';

export class LoadoutManager {
  constructor(private repo: Repository) {}

  /** Create a new loadout. */
  create(loadout: LoadoutDefinition): void {
    const existing = this.repo.getLoadout(loadout.name);
    if (existing) {
      throw new LoadoutError(`Loadout '${loadout.name}' already exists`);
    }
    this.repo.upsertLoadout(loadout);
  }

  /** List all loadouts. */
  list(): LoadoutDefinition[] {
    return this.repo.listLoadouts();
  }

  /** Get a loadout by name. */
  get(name: string): LoadoutDefinition | null {
    return this.repo.getLoadout(name);
  }

  /** Update an existing loadout. */
  update(name: string, update: Partial<LoadoutDefinition>): void {
    const existing = this.repo.getLoadout(name);
    if (!existing) {
      throw new LoadoutError(`Loadout '${name}' not found`);
    }

    const merged: LoadoutDefinition = {
      ...existing,
      ...update,
      name: existing.name, // prevent renaming via update
    };
    this.repo.upsertLoadout(merged);
  }

  /** Delete a loadout. Cannot delete an active loadout. */
  delete(name: string): void {
    const existing = this.repo.getLoadout(name);
    if (!existing) {
      throw new LoadoutError(`Loadout '${name}' not found`);
    }
    if (existing.active) {
      throw new LoadoutError(`Cannot delete active loadout '${name}' (deactivate first)`);
    }
    this.repo.deleteLoadout(name);
  }

  /** Activate a loadout for a harness. */
  activate(harness: string, loadoutName: string): void {
    const loadout = this.repo.getLoadout(loadoutName);
    if (!loadout) {
      throw new LoadoutError(`Loadout '${loadoutName}' not found`);
    }
    if (!loadout.harnesses.includes(harness)) {
      // Auto-assign the harness if not already assigned
      loadout.harnesses.push(harness);
      this.repo.upsertLoadout(loadout);
    }
    this.repo.activateLoadout(harness, loadoutName);
  }

  /** Deactivate all loadouts for a harness. */
  deactivate(harness: string): void {
    const all = this.repo.listLoadouts();
    for (const l of all) {
      if (l.harnesses.includes(harness) && l.active) {
        this.repo.upsertLoadout({ ...l, active: false });
      }
    }
  }

  /** Get the active loadout for a harness, or null. */
  getActiveLoadout(harness: string): LoadoutDefinition | null {
    const all = this.repo.listLoadouts();
    return all.find((l) => l.harnesses.includes(harness) && l.active) ?? null;
  }

  /** Copy a loadout with a new name. */
  copy(loadoutName: string, newName: string): LoadoutDefinition {
    if (loadoutName === newName) {
      throw new LoadoutError('Cannot copy to the same name');
    }

    const existing = this.repo.getLoadout(loadoutName);
    if (!existing) {
      throw new LoadoutError(`Loadout '${loadoutName}' not found`);
    }

    const copy: LoadoutDefinition = {
      ...existing,
      name: newName,
      active: false,
    };

    this.repo.upsertLoadout(copy);
    return copy;
  }
}

export class LoadoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoadoutError';
  }
}
