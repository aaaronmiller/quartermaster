// ─────────────────────────────────────────────────────────────
// Quartermaster — Loadout Manager
// Manages named subsets of artifacts + pipelines per harness.
// ─────────────────────────────────────────────────────────────

import type { Artifact, LoadoutDefinition, PipelineDefinition } from '@core/types';
import type { Repository } from '@storage/repository';

/**
 * Loadout manager handles CRUD and activation of loadouts.
 * A loadout defines which artifacts and pipelines are deployed to which harnesses.
 */
export class LoadoutManager {
  constructor(private repo: Repository) {}

  /** Create or update a loadout. */
  upsertLoadout(def: LoadoutDefinition): void {
    this.repo.upsertLoadout(def);
  }

  /** Get a loadout by name. */
  getLoadout(name: string): LoadoutDefinition | null {
    return this.repo.getLoadout(name);
  }

  /** List all loadouts. */
  listLoadouts(): LoadoutDefinition[] {
    return this.repo.listLoadouts();
  }

  /** Delete a loadout. */
  deleteLoadout(name: string): boolean {
    return this.repo.deleteLoadout(name);
  }

  /** Activate a loadout for a harness (deactivates others for that harness). */
  activateLoadout(harness: string, name: string): void {
    this.repo.activateLoadout(harness, name);
  }

  /** Get the active loadout for a harness. */
  getActiveLoadout(harness: string): LoadoutDefinition | null {
    const all = this.listLoadouts();
    return all.find((l) => l.active && l.harnesses.includes(harness)) ?? null;
  }

  /** Filter artifacts by active loadout for a harness. */
  filterArtifactsForHarness(artifacts: Artifact[], harness: string): Artifact[] {
    const loadout = this.getActiveLoadout(harness);
    if (!loadout) return artifacts; // No loadout → all artifacts

    const ids = new Set(loadout.artifacts);
    return artifacts.filter((a) => ids.has(a.id));
  }

  /** Get pipeline names referenced by active loadout for a harness. */
  getActivePipelines(harness: string): string[] {
    const loadout = this.getActiveLoadout(harness);
    return loadout?.pipelines ?? [];
  }
}

/**
 * Pipeline manager handles ordered artifact sequences with directives.
 */
export class PipelineManager {
  constructor(private repo: Repository) {}

  /** Create or update a pipeline. */
  upsertPipeline(def: PipelineDefinition): void {
    const raw = {
      name: def.name,
      artifacts: JSON.stringify(def.artifacts),
      directives: JSON.stringify(def.directives),
    };
    this.repo.db
      .prepare(
        `INSERT INTO pipelines (name, artifacts, directives)
         VALUES (?, ?, ?)
         ON CONFLICT(name) DO UPDATE SET artifacts = ?, directives = ?`,
      )
      .run(def.name, raw.artifacts, raw.directives, raw.artifacts, raw.directives);
  }

  /** Get a pipeline by name. */
  getPipeline(name: string): PipelineDefinition | null {
    const row = this.repo.db.prepare('SELECT * FROM pipelines WHERE name = ?').get(name) as {
      name: string;
      artifacts: string;
      directives: string;
    } | null;
    if (!row) return null;
    return {
      name: row.name,
      artifacts: JSON.parse(row.artifacts),
      directives: JSON.parse(row.directives),
    };
  }

  /** List all pipelines. */
  listPipelines(): PipelineDefinition[] {
    const rows = this.repo.db.prepare('SELECT * FROM pipelines').all() as {
      name: string;
      artifacts: string;
      directives: string;
    }[];
    return rows.map((r) => ({
      name: r.name,
      artifacts: JSON.parse(r.artifacts),
      directives: JSON.parse(r.directives),
    }));
  }

  /** Resolve ordered artifact IDs from a pipeline. */
  resolvePipeline(name: string, availableArtifacts: Artifact[]): Artifact[] {
    const pipe = this.getPipeline(name);
    if (!pipe) return [];

    const artifactMap = new Map(availableArtifacts.map((a) => [a.id, a]));
    const ordered: Artifact[] = [];

    for (const id of pipe.artifacts) {
      const art = artifactMap.get(id);
      if (art) ordered.push(art);
    }

    return ordered;
  }
}
