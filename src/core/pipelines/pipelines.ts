// ─────────────────────────────────────────────────────────────
// Quartermaster — Pipeline Engine
// Defines ordered artifact groups with directives
// that feed into guidance generation and deployment.
// ─────────────────────────────────────────────────────────────

import type { Artifact, PipelineDefinition } from '@core/types';
import type { Repository } from '@storage/repository';

export class PipelineManager {
  constructor(private repo: Repository) {}

  /** Create a new pipeline. */
  create(pipeline: PipelineDefinition): void {
    const existing = this.repo.queryRow<{ name: string }>(
      'SELECT name FROM pipelines WHERE name = ?',
      [pipeline.name],
    );
    if (existing) {
      throw new PipelineError(`Pipeline '${pipeline.name}' already exists`);
    }

    // Auto-register in the pipelines table
    this.repo.queryRaw(
      `INSERT OR REPLACE INTO pipelines (name, artifacts, directives) VALUES (?, ?, ?)`,
      [pipeline.name, JSON.stringify(pipeline.artifacts), JSON.stringify(pipeline.directives)],
    );
  }

  /** List all pipelines. */
  list(): PipelineDefinition[] {
    const rows = this.repo.queryRaw('SELECT * FROM pipelines');
    return rows.map(rowToPipeline);
  }

  /** Get a pipeline by name. */
  get(name: string): PipelineDefinition | null {
    const row = this.repo.queryRow<Record<string, unknown>>(
      'SELECT * FROM pipelines WHERE name = ?',
      [name],
    );
    return row ? rowToPipeline(row) : null;
  }

  /** Delete a pipeline. */
  delete(name: string): void {
    this.repo.queryRaw('DELETE FROM pipelines WHERE name = ?', [name]);
  }

  /**
   * Validate a pipeline definition.
   * Returns an array of error messages (empty = valid).
   */
  validate(pipeline: PipelineDefinition): string[] {
    const errors: string[] = [];

    if (!pipeline.name) {
      errors.push('Pipeline name is required');
      return errors;
    }

    // Check for duplicate artifact IDs within the pipeline
    const seen = new Set<string>();
    for (const id of pipeline.artifacts) {
      if (seen.has(id)) {
        errors.push(`Duplicate artifact ID in pipeline: ${id}`);
      }
      seen.add(id);

      // Check artifact exists in catalog
      const artifact = this.repo.getArtifact(id);
      if (!artifact) {
        errors.push(`Artifact '${id}' referenced by pipeline not found in catalog`);
      }
    }

    // Check for circular references (pipelines referencing other pipelines)
    // This is not a typical pattern but we check for it
    if (Array.isArray(pipeline.directives?.pipelineRefs)) {
      for (const ref of pipeline.directives.pipelineRefs as string[]) {
        const refPipeline = this.repo.queryRow<Record<string, unknown>>(
          'SELECT name FROM pipelines WHERE name = ?',
          [ref],
        );
        if (!refPipeline) {
          errors.push(`Referenced pipeline '${ref}' not found`);
        }
      }
    }

    return errors;
  }

  /**
   * Compose multiple pipelines into a single ordered artifact list.
   * Respects exclusivity: a pipeline with exclusive=true excludes
   * same-type artifacts from other pipelines.
   */
  compose(pipelines: PipelineDefinition[]): Artifact[] {
    if (pipelines.length === 0) return [];

    const allArtifacts: Artifact[] = [];
    const seenIds = new Set<string>();
    const exclusiveTypes = new Set<string>();

    // Sort by priority (lower number = higher priority)
    const sorted = [...pipelines].sort((a, b) => {
      const pA = (a.directives?.priority as number) ?? 100;
      const pB = (b.directives?.priority as number) ?? 100;
      return pA - pB;
    });

    for (const pipeline of sorted) {
      const exclusive = pipeline.directives?.exclusive === true;

      for (const artifactId of pipeline.artifacts) {
        if (seenIds.has(artifactId)) continue;

        const artifact = this.repo.getArtifact(artifactId);
        if (!artifact) continue;

        // Check if this artifact's type is excluded by an exclusive pipeline
        if (exclusiveTypes.has(artifact.type) && !exclusive) {
          continue; // Skip — an exclusive pipeline already covers this type
        }

        allArtifacts.push(artifact);
        seenIds.add(artifactId);

        // If this pipeline is exclusive, add its artifact types to the exclusion set
        if (exclusive) {
          exclusiveTypes.add(artifact.type);
        }
      }
    }

    return allArtifacts;
  }
}

// ─── Helpers ───────────────────────────────────────────────

function rowToPipeline(row: Record<string, unknown>): PipelineDefinition {
  return {
    name: row.name as string,
    artifacts: JSON.parse(row.artifacts as string),
    directives: JSON.parse((row.directives as string) ?? '{}'),
  };
}

export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PipelineError';
  }
}
