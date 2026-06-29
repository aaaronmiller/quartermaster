// ─────────────────────────────────────────────────────────────
// Quartermaster — Pipeline Validation (FR-113)
// Validates pipeline references exist in catalog and optionally
// validates Noun/Verb/Adjective compatibility when composition enabled.
// ─────────────────────────────────────────────────────────────

import type { Artifact, PipelineDefinition } from '@core/types';
import { Repository } from '@storage/repository';
import { validateComposition } from '@core/composition/validate';
import type { ComposableArtifact, CompositionChain, CompositionRole } from '@core/composition/model';

export interface ValidationError {
  pipeline: string;
  errors: string[];
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Validate a pipeline:
 * 1. All referenced artifact IDs exist in the catalog
 * 2. If composition enabled, verify Noun/Verb/Adjective compatibility
 */
export function validatePipeline(
  repo: Repository,
  pipeline: PipelineDefinition,
  compositionEnabled = false,
): ValidationResult {
  const errors: ValidationError[] = [];
  const pipelineErrors: string[] = [];

  // Check all artifact references exist
  for (const artifactId of pipeline.artifacts) {
    const artifact = repo.getArtifact(artifactId);
    if (!artifact) {
      pipelineErrors.push(`Artifact '${artifactId}' referenced by pipeline not found in catalog`);
    }
  }

  // Check composition compatibility when enabled
  if (compositionEnabled) {
    const artifacts = pipeline.artifacts
      .map((id) => repo.getArtifact(id))
      .filter((a): a is Artifact => a !== null);

    const compResult = validateCompositionCompatibility(artifacts);
    pipelineErrors.push(...compResult);
  }

  if (pipelineErrors.length > 0) {
    errors.push({ pipeline: pipeline.name, errors: pipelineErrors });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate all pipelines in the repository.
 */
export function validateAllPipelines(
  repo: Repository,
  compositionEnabled = false,
): ValidationResult {
  const pipelines = repo.queryRaw('SELECT * FROM pipelines');
  const allErrors: ValidationError[] = [];

  for (const row of pipelines) {
    const pipeline: PipelineDefinition = {
      name: String(row.name),
      artifacts: JSON.parse(String(row.artifacts)),
      directives: JSON.parse(String(row.directives ?? '{}')),
    };
    const result = validatePipeline(repo, pipeline, compositionEnabled);
    allErrors.push(...result.errors);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * Validate Noun/Verb/Adjective compatibility across an ordered pipeline.
 *
 * Composition roles and IO contracts are declared per artifact in
 * `metadata.composition` (`{ role, inputs, outputs, enhanceable }`). The
 * ordered pipeline is treated as a linear chain (artifact[i] → artifact[i+1])
 * and handed to the shared deterministic composition validator. Any issue it
 * reports (incompatible IO, invalid adjective attachment, cycle) becomes a
 * plain-language pipeline error. Artifacts that declare no composition role are
 * skipped — composition metadata is opt-in and must never block a plain
 * skill-only pipeline.
 */
function validateCompositionCompatibility(artifacts: Artifact[]): string[] {
  const composable = artifacts
    .map(toComposable)
    .filter((node): node is ComposableArtifact => node !== null);

  // Need at least one declared role for composition to mean anything.
  if (composable.length === 0) return [];

  const composableIds = new Set(composable.map((node) => node.id));
  const edges: CompositionChain['edges'] = [];
  // Build edges only between consecutive artifacts that both declare a role.
  for (let i = 0; i < artifacts.length - 1; i++) {
    const from = artifacts[i];
    const to = artifacts[i + 1];
    if (from && to && composableIds.has(from.id) && composableIds.has(to.id)) {
      edges.push({ from: from.id, to: to.id });
    }
  }

  const result = validateComposition({ artifacts: composable, edges }, { enabled: true });
  return result.issues.map((issue) => `composition: ${issue.message}`);
}

const COMPOSITION_ROLES: ReadonlySet<string> = new Set(['noun', 'verb', 'adjective']);

/** Derive a ComposableArtifact from `metadata.composition`, or null if undeclared. */
function toComposable(artifact: Artifact): ComposableArtifact | null {
  const raw = artifact.metadata?.composition;
  if (!raw || typeof raw !== 'object') return null;
  const spec = raw as Record<string, unknown>;
  const role = typeof spec.role === 'string' && COMPOSITION_ROLES.has(spec.role) ? (spec.role as CompositionRole) : null;
  if (!role) return null;
  return {
    id: artifact.id,
    role,
    inputs: stringArray(spec.inputs),
    outputs: stringArray(spec.outputs),
    enhanceable: spec.enhanceable === true,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}