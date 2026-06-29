// ─────────────────────────────────────────────────────────────
// Quartermaster — Flatten Name Transformation
// Converts nested library paths to flat harness paths without collisions.
// ─────────────────────────────────────────────────────────────

import { basename, dirname, join } from 'node:path';
import { DeployError } from './plan';

export interface FlattenRecord {
  source: string;
  target: string;
  reason: 'flatten' | 'disambiguate';
}

export interface FlattenableOperation {
  sourcePath: string;
  targetPath: string;
}

export function flattenPath(artifactPath: string): string {
  return basename(artifactPath);
}

export function detectCollisions(
  operations: Array<FlattenableOperation>,
): Map<string, string[]> {
  const targetMap = new Map<string, string[]>();
  for (const op of operations) {
    targetMap.set(op.targetPath, [...(targetMap.get(op.targetPath) ?? []), op.sourcePath]);
  }
  return new Map(Array.from(targetMap.entries()).filter(([, sources]) => sources.length > 1));
}

export function disambiguate(
  collisions: Map<string, string[]>,
  maxSegments = 8,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [, sources] of collisions) {
    const used = new Set<string>();
    for (const source of sources) {
      const uniqueName = uniqueFlattenName(source, used, maxSegments);
      used.add(uniqueName);
      result.set(source, uniqueName);
    }
  }

  return result;
}

export function flattenOperations<T extends FlattenableOperation>(
  operations: T[],
): {
  operations: T[];
  log: FlattenRecord[];
} {
  const log: FlattenRecord[] = [];
  const flattened = operations.map((op) => {
    const flatName = flattenPath(op.sourcePath);
    const targetPath = join(dirname(op.targetPath), flatName);
    if (targetPath !== op.targetPath) {
      log.push({ source: op.sourcePath, target: targetPath, reason: 'flatten' });
    }
    return { ...op, targetPath };
  });

  const collisions = detectCollisions(flattened);
  if (collisions.size === 0) return { operations: flattened, log };

  const namesBySource = disambiguate(collisions);
  const resolved = flattened.map((op) => {
    const disambiguated = namesBySource.get(op.sourcePath);
    if (!disambiguated) return op;
    const targetPath = join(dirname(op.targetPath), disambiguated);
    if (targetPath !== op.targetPath) {
      log.push({ source: op.sourcePath, target: targetPath, reason: 'disambiguate' });
    }
    return { ...op, targetPath };
  });

  const unresolved = detectCollisions(resolved);
  if (unresolved.size > 0) {
    const details = Array.from(unresolved.entries())
      .map(([target, sources]) => `${target}: ${sources.join(', ')}`)
      .join('; ');
    throw new DeployError(`could not resolve flattened target collisions: ${details}`);
  }

  return { operations: resolved, log };
}

function uniqueFlattenName(sourcePath: string, used: Set<string>, maxSegments: number): string {
  const parts = sourcePath.replace(/\\/g, '/').split('/').filter(Boolean);
  const fileName = parts.at(-1) ?? basename(sourcePath);
  const parents = parts.slice(0, -1).reverse();

  for (let count = 1; count <= Math.min(maxSegments, parents.length); count++) {
    const prefix = parents.slice(0, count).reverse().join('-');
    const candidate = `${prefix}-${fileName}`;
    if (!used.has(candidate)) return candidate;
  }

  const full = parts.join('-');
  if (!used.has(full)) return full;
  throw new DeployError(`could not create unique flattened name for '${sourcePath}'`);
}
