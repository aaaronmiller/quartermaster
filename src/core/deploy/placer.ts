// ─────────────────────────────────────────────────────────────
// Quartermaster — File Placement Executor
// Executes link/copy operations with prior state capture
// and atomic batch rollback.
// ─────────────────────────────────────────────────────────────

import type { DeploymentOperation, DeploymentPlan } from '@core/types';
import type { Repository } from '@storage/repository';
import { createHash } from 'crypto';
import { existsSync, promises as fs } from 'fs';
import { dirname } from 'path';
import { DeployError } from './plan';

export interface OperationResult {
  operation: DeploymentOperation;
  status: 'placed' | 'skipped' | 'failed';
  error?: string;
}

export interface PlacementResult {
  operations: OperationResult[];
  rollback: () => Promise<void>;
}

/**
 * Execute all operations in a deployment plan.
 * Batch semantics: if any operation fails, roll back all prior successful ones.
 */
export async function executePlacement(
  plan: DeploymentPlan,
  _repo?: Repository,
): Promise<PlacementResult> {
  const results: OperationResult[] = [];
  const appliedOperations: Array<{
    op: DeploymentOperation;
    priorState: DeploymentOperation['priorState'];
  }> = [];

  for (const op of plan.operations) {
    try {
      // Ensure target directory exists
      const targetDir = dirname(op.targetPath);
      await fs.mkdir(targetDir, { recursive: true });

      // Capture prior state
      const priorState = await capturePriorState(op.targetPath);

      // Execute placement
      if (op.method === 'link') {
        try {
          // Remove existing if present
          if (existsSync(op.targetPath)) {
            await fs.unlink(op.targetPath);
          }
          await fs.symlink(op.sourcePath, op.targetPath);
        } catch (err) {
          // Fall back to copy on EPERM / EACCES (Windows without dev mode)
          const nodeErr = err as NodeJS.ErrnoException;
          if (nodeErr.code === 'EPERM' || nodeErr.code === 'EACCES') {
            await fs.copyFile(op.sourcePath, op.targetPath);
          } else {
            throw err;
          }
        }
      } else {
        // copyFile with COPYFILE_FICLONE (reflink attempt, fall back to stream)
        try {
          await fs.copyFile(op.sourcePath, op.targetPath, fs.constants.COPYFILE_FICLONE);
        } catch {
          // Fall back to regular copy
          await fs.copyFile(op.sourcePath, op.targetPath);
        }
      }

      results.push({ operation: op, status: 'placed' });
      appliedOperations.push({ op, priorState });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ operation: op, status: 'failed', error: msg });

      // Batch rollback: revert all prior operations
      for (const applied of appliedOperations) {
        try {
          await restorePriorState(applied.op, applied.priorState);
        } catch (rollbackErr) {
          const rbMsg = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
          console.error(
            `[CRITICAL] Partial rollback: could not restore ${applied.op.targetPath}: ${rbMsg}`,
          );
        }
      }
      break; // Stop execution on failure
    }
  }

  return {
    operations: results,
    rollback: async () => {
      for (const applied of appliedOperations) {
        await restorePriorState(applied.op, applied.priorState);
      }
    },
  };
}

// ─── Prior State ────────────────────────────────────────────

async function capturePriorState(targetPath: string): Promise<DeploymentOperation['priorState']> {
  if (!existsSync(targetPath)) {
    return undefined; // No prior state (new file)
  }

  try {
    const content = await fs.readFile(targetPath);
    const stat = await fs.stat(targetPath);
    return {
      contentHash: createHash('sha256').update(content).digest('hex'),
      permissions: stat.mode,
    };
  } catch {
    return undefined;
  }
}

async function restorePriorState(
  op: DeploymentOperation,
  priorState: DeploymentOperation['priorState'] | undefined,
): Promise<void> {
  if (!priorState) {
    // No prior state → this was a new file, delete it
    try {
      if (existsSync(op.targetPath)) {
        await fs.unlink(op.targetPath);
      }
    } catch {
      // Best effort
    }
    return;
  }

  // Restore content from original source
  await fs.copyFile(op.sourcePath, op.targetPath);
}
