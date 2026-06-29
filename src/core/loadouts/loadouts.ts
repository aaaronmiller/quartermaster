// ─────────────────────────────────────────────────────────────
// Quartermaster — Loadout Manager
// Named subsets of artifacts + pipelines for scoped deployment.
// ─────────────────────────────────────────────────────────────

import type { Artifact, LoadoutDefinition, PipelineDefinition } from '@core/types';
import type { Repository } from '@storage/repository';
import { validatePipeline } from '@core/pipelines/validate';

export interface LoadoutStatus {
  harness: string;
  activeLoadout: string | null;
  activeArtifactCount: number;
  activeArtifacts: string[];
}

export class LoadoutManager {
  constructor(private repo: Repository) {}

  /** Create a new loadout. */
  create(loadout: LoadoutDefinition): LoadoutDefinition {
    const normalized = normalizeLoadout(loadout);
    const existing = this.repo.getLoadout(normalized.name);
    if (existing) {
      throw new LoadoutError(`Loadout '${normalized.name}' already exists`);
    }
    this.repo.upsertLoadout(normalized);
    return normalized;
  }

  /** Create a loadout from member lists; harness-independent by default. */
  createNamed(name: string, artifacts: string[] = [], pipelines: string[] = []): LoadoutDefinition {
    return this.create({ name, harnesses: [], artifacts, pipelines, active: false });
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

  /** Add artifact or pipeline members while preserving distinct membership. */
  addMember(name: string, kind: 'artifact' | 'pipeline', id: string): LoadoutDefinition {
    const existing = this.requireLoadout(name);
    const key = kind === 'artifact' ? 'artifacts' : 'pipelines';
    const next = { ...existing, [key]: addUnique(existing[key], id) };
    this.repo.upsertLoadout(next);
    return next;
  }

  /** Remove artifact or pipeline members. */
  removeMember(name: string, kind: 'artifact' | 'pipeline', id: string): LoadoutDefinition {
    const existing = this.requireLoadout(name);
    const key = kind === 'artifact' ? 'artifacts' : 'pipelines';
    const next = { ...existing, [key]: existing[key].filter((member) => member !== id) };
    this.repo.upsertLoadout(next);
    return next;
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

  /**
   * Validate every pipeline a loadout carries (FR-113). Returns the flat list
   * of plain-language errors; empty means all member pipelines are valid.
   */
  validateLoadoutPipelines(loadout: LoadoutDefinition, compositionEnabled = false): string[] {
    const problems: string[] = [];
    for (const pipelineName of loadout.pipelines) {
      const pipeline = this.repo.getPipeline(pipelineName);
      if (!pipeline) {
        problems.push(`pipeline '${pipelineName}' referenced by loadout not found`);
        continue;
      }
      const result = validatePipeline(this.repo, pipeline, compositionEnabled);
      for (const entry of result.errors) problems.push(...entry.errors);
    }
    return problems;
  }

  /** Resolve directives of the active loadout's pipelines for guidance injection (FR-121). */
  activePipelineDirectives(harness: string): PipelineDefinition[] {
    const active = this.getActiveLoadout(harness);
    if (!active) return [];
    const pipelines: PipelineDefinition[] = [];
    for (const pipelineName of active.pipelines) {
      const pipeline = this.repo.getPipeline(pipelineName);
      if (pipeline) pipelines.push(pipeline);
    }
    return pipelines;
  }

  /**
   * Activate a loadout for a harness. Activation is blocked (FR-113) until every
   * member pipeline validates against the catalog.
   */
  activate(harness: string, loadoutName: string): LoadoutDefinition {
    const loadout = this.requireLoadout(loadoutName);
    const pipelineProblems = this.validateLoadoutPipelines(loadout);
    if (pipelineProblems.length > 0) {
      throw new LoadoutError(
        `Cannot activate loadout '${loadoutName}': invalid pipeline(s) — ${pipelineProblems.join('; ')}`,
      );
    }
    if (!loadout.harnesses.includes(harness)) {
      // Auto-assign the harness if not already assigned
      loadout.harnesses = [...loadout.harnesses, harness];
      this.repo.upsertLoadout(loadout);
    }
    this.repo.activateLoadout(harness, loadoutName);
    return this.requireLoadout(loadoutName);
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

  /** Copy a loadout definition with a new name. */
  copyDefinition(loadoutName: string, newName: string): LoadoutDefinition {
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

  /** Apply an existing loadout to another harness. */
  copyToHarness(loadoutName: string, fromHarness: string, toHarness: string): LoadoutDefinition {
    const existing = this.requireLoadout(loadoutName);
    if (!existing.harnesses.includes(fromHarness)) {
      throw new LoadoutError(`Loadout '${loadoutName}' is not assigned to harness '${fromHarness}'`);
    }
    const assigned = {
      ...existing,
      harnesses: addUnique(existing.harnesses, toHarness),
    };
    this.repo.upsertLoadout(assigned);
    return this.activate(toHarness, loadoutName);
  }

  /** Resolve all artifact IDs included directly or through pipelines. */
  activeArtifactIds(loadout: LoadoutDefinition): string[] {
    const ids = new Set(loadout.artifacts);
    for (const pipelineName of loadout.pipelines) {
      const pipeline = this.repo.getPipeline(pipelineName);
      for (const artifactId of pipeline?.artifacts ?? []) ids.add(artifactId);
    }
    return [...ids];
  }

  /** Filter artifacts through the active loadout for the harness. */
  filterArtifactsForHarness(artifacts: Artifact[], harness: string): Artifact[] {
    const loadout = this.getActiveLoadout(harness);
    if (!loadout) return artifacts;
    const ids = new Set(this.activeArtifactIds(loadout));
    return artifacts.filter((artifact) => ids.has(artifact.id));
  }

  /** Report active loadout identity and active artifact count. */
  status(harness: string): LoadoutStatus {
    const active = this.getActiveLoadout(harness);
    const activeArtifacts = active ? this.activeArtifactIds(active) : [];
    return {
      harness,
      activeLoadout: active?.name ?? null,
      activeArtifactCount: activeArtifacts.length,
      activeArtifacts,
    };
  }

  private requireLoadout(name: string): LoadoutDefinition {
    const loadout = this.repo.getLoadout(name);
    if (!loadout) throw new LoadoutError(`Loadout '${name}' not found`);
    return loadout;
  }
}

export class LoadoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoadoutError';
  }
}

function normalizeLoadout(loadout: LoadoutDefinition): LoadoutDefinition {
  return {
    name: loadout.name,
    harnesses: [...new Set(loadout.harnesses)],
    artifacts: [...new Set(loadout.artifacts)],
    pipelines: [...new Set(loadout.pipelines)],
    active: loadout.active,
  };
}

function addUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}
