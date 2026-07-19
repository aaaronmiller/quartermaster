import type { Artifact } from '@core/types';

export type SourceClass = 'first-party' | 'third-party' | 'harness-defaults' | 'unclassified';
export type Lifecycle = 'active' | 'specialist' | 'deprecated' | 'superseded' | 'quarantined';
export type CompositionRole = 'noun' | 'verb' | 'modifier' | 'coordinator';

export interface ArtifactClassification {
  sourceClass: SourceClass;
  lifecycle: Lifecycle;
  functions: string[];
  domains: string[];
  tags: string[];
  compositionRole: CompositionRole;
  cost: string[];
}

const KNOWN_FUNCTIONS = [
  'coding', 'audit', 'research', 'design', 'writing', 'media', 'operations',
  'planning', 'memory', 'orchestration', 'safety',
];

export function classifyArtifactMetadata(
  metadata: Record<string, unknown>,
  organizationalPath: string,
  name: string,
): ArtifactClassification {
  const tags = strings(metadata.tags);
  const searchable = `${name} ${organizationalPath} ${String(metadata.description ?? '')} ${tags.join(' ')}`.toLowerCase();
  const sourceClass = sourceClassFromPath(organizationalPath);
  const lifecycle = lifecycleFrom(metadata.lifecycle, organizationalPath, tags);
  const functions = unique([
    ...strings(metadata.functions),
    ...strings(metadata.function),
    ...KNOWN_FUNCTIONS.filter((candidate) => searchable.includes(candidate)),
  ]);
  const domains = unique([...strings(metadata.domains), ...strings(metadata.domain)]);
  const compositionRole = roleFrom(metadata.compositionRole ?? metadata.role, searchable);
  const cost = unique([...strings(metadata.cost), ...(lifecycle === 'specialist' ? ['on-demand'] : [])]);
  return { sourceClass, lifecycle, functions, domains, tags, compositionRole, cost };
}

export function artifactClassification(artifact: Artifact): ArtifactClassification {
  const stored = artifact.metadata.classification;
  if (stored && typeof stored === 'object') return stored as ArtifactClassification;
  return classifyArtifactMetadata(artifact.metadata, artifact.organizationalPath, artifact.name);
}

function sourceClassFromPath(path: string): SourceClass {
  const first = path.split('/')[0];
  if (first === 'first-party' || first === 'third-party' || first === 'harness-defaults') return first;
  return 'unclassified';
}

function lifecycleFrom(value: unknown, path: string, tags: string[]): Lifecycle {
  const candidate = typeof value === 'string' ? value : '';
  if (['active', 'specialist', 'deprecated', 'superseded', 'quarantined'].includes(candidate)) {
    return candidate as Lifecycle;
  }
  const signal = `${path} ${tags.join(' ')}`.toLowerCase();
  if (signal.includes('deprecated')) return 'deprecated';
  if (signal.includes('specialist') || signal.includes('library-only')) return 'specialist';
  if (signal.includes('quarantine')) return 'quarantined';
  return 'active';
}

function roleFrom(value: unknown, searchable: string): CompositionRole {
  if (typeof value === 'string' && ['noun', 'verb', 'modifier', 'coordinator'].includes(value)) {
    return value as CompositionRole;
  }
  if (/refinement|goal.setting|deliberat|critic|review mode/.test(searchable)) return 'modifier';
  if (/pipeline|orchestrat|coordinat|workflow/.test(searchable)) return 'coordinator';
  return 'verb';
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  return [];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()).filter(Boolean))];
}
