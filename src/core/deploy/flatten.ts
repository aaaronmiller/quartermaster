// ─────────────────────────────────────────────────────────────
// Quartermaster — Flatten Name Transformation
// Converts nested library paths to flat harness paths with
// collision detection and disambiguation.
// ─────────────────────────────────────────────────────────────

import { basename, dirname, relative, sep } from 'path';
import { DeployError } from './plan';

/**
 * Flatten a nested path to just the filename.
 * If the artifact is already at flat root, returns unchanged.
 */
export function flattenPath(artifactPath: string, _libraryRoot?: string): string {
  return basename(artifactPath);
}

export interface FlattenRecord {
  source: string;
  target: string;
  reason: 'flatten' | 'disambiguate';
}

/**
 * Detect collisions in a set of operations.
 * Returns a map of target path → array of source paths that collide.
 */
export function detectCollisions(
  operations: Array<{ sourcePath: string; targetPath: string }>,
): Map<string, string[]> {
  const targetMap = new Map<string, string[]>();

  for (const op of operations) {
    const existing = targetMap.get(op.targetPath) ?? [];
    existing.push(op.sourcePath);
    targetMap.set(op.targetPath, existing);
  }

  // Filter to only collisions (2+ sources per target)
  const collisions = new Map<string, string[]>();
  for (const [target, sources] of targetMap) {
    if (sources.length > 1) {
      collisions.set(target, sources);
    }
  }

  return collisions;
}

/**
 * Disambiguate colliding paths by prepending parent directory names.
 * Tries prepending immediate parent, then grandparent, etc.
 */
export function disambiguate(
  collisions: Map<string, string[]>,
  maxAttempts = 5,
): Map<string, string> {
  const result = new Map<string, string>();

  for (const [target, sources] of collisions) {
    for (const source of sources) {
      const parts = source.replace(/\\/g, '/').split('/');
      let newName = basename(source);
      let attempt = 0;

      while (attempt < maxAttempts) {
        const existingSources = result.has(newName) ? [result.get(newName)!, source] : [source];

        // Check if this name is unique among the collision set
        const isUnique =
          !result.has(newName) || !sources.some((s) => s !== source && basename(s) === newName);

        if (isUnique) {
          break;
        }

        // Prepend next parent directory
        const parentIdx = parts.length - 2 - attempt;
        if (parentIdx >= 0) {
          newName = `${parts[parentIdx]}-${newName}`;
        } else {
          // Include full relative path as last resort
          newName = parts.join('-');
          break;
        }

        attempt++;
      }

      if (attempt >= maxAttempts) {
        throw new DeployError(
          `Could not resolve collision for '${source}' after ${maxAttempts} attempts. ` +
            `Colliding paths: ${sources.join(', ')}`,
        );
      }

      result.set(source, newName);
    }
  }

  return result;
}

/**
 * Flatten a set of operations with full collision detection and resolution.
 * Returns the original operations array with disambiguated target paths
 * plus a log of what was flattened.
 */
export function flattenOperations(
  operations: Array<{ sourcePath: string; targetPath: string }>,
  _libraryRoot?: string,
): {
  operations: Array<{ sourcePath: string; targetPath: string }>;
  log: FlattenRecord[];
} {
  const log: FlattenRecord[] = [];

  // First pass: flatten all to basename
  const flattened = operations.map((op) => {
    const flatTarget = flattenPath(op.sourcePath, _libraryRoot);
    if (flatTarget !== basename(op.targetPath)) {
      log.push({
        source: op.sourcePath,
        target: flatTarget,
        reason: 'flatten',
      });
    }
    return { ...op, targetPath: flatTarget };
  });

  // Check for collisions
  const collisions = detectCollisions(flattened);
  if (collisions.size === 0) {
    return { operations: flattened, log };
  }

  // Disambiguate
  const disambiguated = disambiguate(collisions);
  const resolved = flattened.map((op) => {
    const newTarget = disambiguated.get(op.sourcePath);
    if (newTarget && newTarget !== op.targetPath) {
      log.push({
        source: op.sourcePath,
        target: newTarget,
        reason: 'disambiguate',
      });
      return { ...op, targetPath: newTarget };
    }
    return op;
  });

  return { operations: resolved, log };
}
