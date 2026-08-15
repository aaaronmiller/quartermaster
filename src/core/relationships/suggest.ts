import { artifactClassification } from '@core/classification/classify';
import type { Artifact } from '@core/types';
import type { Repository } from '@storage/repository';

export interface ArtifactRelationshipSuggestion {
  artifactId: string;
  relation: 'pipeline-peer' | 'works-with' | 'requires' | 'enhances' | 'supersedes' | 'similar-function';
  score: number;
  evidence: string;
}

export function suggestRelatedArtifacts(repo: Repository, artifactId: string): ArtifactRelationshipSuggestion[] {
  const artifact = repo.getArtifact(artifactId);
  if (!artifact) return [];
  const suggestions = new Map<string, ArtifactRelationshipSuggestion>();

  for (const pipeline of repo.listPipelines()) {
    if (!pipeline.artifacts.includes(artifactId)) continue;
    for (const peer of pipeline.artifacts) {
      if (peer !== artifactId) add(suggestions, peer, 'pipeline-peer', 1, `shared pipeline: ${pipeline.name}`);
    }
  }
  for (const relation of ['works-with', 'requires', 'enhances', 'supersedes'] as const) {
    const targets = stringList(artifact.metadata[relation] ?? artifact.metadata[toCamel(relation)]);
    for (const target of targets) {
      const resolved = resolveArtifact(repo.listArtifacts(), target);
      if (resolved) add(suggestions, resolved.id, relation, 0.9, `declared ${relation} metadata`);
    }
  }
  const own = new Set(artifactClassification(artifact).functions);
  if (own.size > 0) {
    for (const candidate of repo.listArtifacts()) {
      if (candidate.id === artifactId) continue;
      const overlap = artifactClassification(candidate).functions.filter((item) => own.has(item));
      if (overlap.length > 0) {
        add(suggestions, candidate.id, 'similar-function', Math.min(0.8, 0.35 + overlap.length * 0.15), `shared function: ${overlap.join(', ')}`);
      }
    }
  }
  return [...suggestions.values()].sort((a, b) => b.score - a.score || a.artifactId.localeCompare(b.artifactId));
}

function add(map: Map<string, ArtifactRelationshipSuggestion>, artifactId: string, relation: ArtifactRelationshipSuggestion['relation'], score: number, evidence: string): void {
  const key = `${artifactId}:${relation}`;
  if (!map.has(key)) map.set(key, { artifactId, relation, score, evidence });
}

function resolveArtifact(artifacts: Artifact[], identity: string): Artifact | undefined {
  const matches = artifacts.filter((artifact) => artifact.id === identity || artifact.name === identity);
  // Never pick an arbitrary match: ambiguous references resolve to nothing.
  return matches.length === 1 ? matches[0] : undefined;
}

function stringList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function toCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}
