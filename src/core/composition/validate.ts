// ─────────────────────────────────────────────────────────────
// Quartermaster — Composition validator
// Deterministic checks for graph shape, IO compatibility, and
// adjective attachment rules.
// ─────────────────────────────────────────────────────────────

import type {
  ComposableArtifact,
  CompositionChain,
  CompositionEdge,
  CompositionIssue,
  CompositionValidationResult,
} from './model';

export interface ValidateCompositionOptions {
  enabled?: boolean;
}

export function validateComposition(
  chain: CompositionChain,
  options: ValidateCompositionOptions = {},
): CompositionValidationResult {
  if (options.enabled === false) {
    return { ok: true, disabled: true, issues: [] };
  }

  const artifacts = new Map(chain.artifacts.map((artifact) => [artifact.id, artifact]));
  const issues: CompositionIssue[] = [];

  for (const edge of chain.edges) {
    const from = artifacts.get(edge.from);
    const to = artifacts.get(edge.to);
    if (!from || !to) {
      issues.push({
        code: 'unknown-node',
        message: `edge references unknown artifact: ${!from ? edge.from : edge.to}`,
        edge,
      });
      continue;
    }
    issues.push(...validateEdge(edge, from, to));
  }

  const cycle = findCycle(chain.edges, artifacts);
  if (cycle) {
    issues.push({ code: 'cycle', message: `composition graph contains a cycle: ${cycle.join(' -> ')}` });
  }

  return { ok: issues.length === 0, disabled: false, issues };
}

function validateEdge(
  edge: CompositionEdge,
  from: ComposableArtifact,
  to: ComposableArtifact,
): CompositionIssue[] {
  const issues: CompositionIssue[] = [];

  if (from.role === 'adjective') {
    if (!to.enhanceable) {
      issues.push({
        code: 'invalid-adjective-attachment',
        message: `adjective '${from.id}' can attach only to an enhanceable artifact`,
        edge,
      });
    }
    return issues;
  }

  const outputs = new Set(from.outputs);
  const compatible = to.inputs.length === 0 || to.inputs.some((input) => outputs.has(input));
  if (!compatible) {
    issues.push({
      code: 'incompatible-io',
      message: `output from '${from.id}' does not satisfy input for '${to.id}'`,
      edge,
    });
  }

  return issues;
}

function findCycle(edges: CompositionEdge[], artifacts: Map<string, ComposableArtifact>): string[] | null {
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (!artifacts.has(edge.from) || !artifacts.has(edge.to)) continue;
    const next = graph.get(edge.from) ?? [];
    next.push(edge.to);
    graph.set(edge.from, next);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function dfs(node: string): string[] | null {
    if (visiting.has(node)) {
      const start = stack.indexOf(node);
      return [...stack.slice(start), node];
    }
    if (visited.has(node)) return null;

    visiting.add(node);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = dfs(next);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(node);
    visited.add(node);
    return null;
  }

  for (const node of artifacts.keys()) {
    const cycle = dfs(node);
    if (cycle) return cycle;
  }
  return null;
}
