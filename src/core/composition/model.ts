// ─────────────────────────────────────────────────────────────
// Quartermaster — Optional composition model (FR-080)
// Noun/Verb/Adjective chains are advisory validation metadata.
// ─────────────────────────────────────────────────────────────

export type CompositionRole = 'noun' | 'verb' | 'adjective';

export interface ComposableArtifact {
  id: string;
  role: CompositionRole;
  inputs: string[];
  outputs: string[];
  /** Adjectives may attach only to nodes that opt into enhancement. */
  enhanceable?: boolean;
}

export interface CompositionEdge {
  from: string;
  to: string;
}

export interface CompositionChain {
  artifacts: ComposableArtifact[];
  edges: CompositionEdge[];
}

export interface CompositionIssue {
  code:
    | 'unknown-node'
    | 'cycle'
    | 'incompatible-io'
    | 'invalid-adjective-attachment';
  message: string;
  edge?: CompositionEdge;
}

export interface CompositionValidationResult {
  ok: boolean;
  disabled: boolean;
  issues: CompositionIssue[];
}
