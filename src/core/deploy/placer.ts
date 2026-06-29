// ─────────────────────────────────────────────────────────────
// Quartermaster — File Placement Executor
// Executes link/copy operations with prior state capture
// and atomic batch rollback.
// ─────────────────────────────────────────────────────────────

import type { DeploymentOperation, DeploymentPlan } from '@core/types';
import type { Repository } from '@storage/repository';
import { createHash } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import { dirname } from 'node:path';

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
      if (await targetMatchesOperation(op)) {
        results.push({ operation: op, status: 'skipped' });
        continue;
      }

      // Ensure target directory exists
      const targetDir = dirname(op.targetPath);
      await fs.mkdir(targetDir, { recursive: true });

      // Capture prior state
      const priorState = await capturePriorState(op.targetPath);
      op.priorState = priorState;

      // Execute placement
      if (op.method === 'link') {
        try {
          if (process.env.QUARTERMASTER_FORCE_COPY_FALLBACK === '1') {
            throw Object.assign(new Error('forced symlink fallback'), { code: 'EPERM' });
          }
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

async function targetMatchesOperation(op: DeploymentOperation): Promise<boolean> {
  if (!existsSync(op.targetPath)) return false;
  try {
    const stat = await fs.lstat(op.targetPath);
    if (op.method === 'link' && stat.isSymbolicLink()) {
      return (await fs.readlink(op.targetPath)) === op.sourcePath;
    }
    if (!stat.isFile()) return false;
    const [source, target] = await Promise.all([fs.readFile(op.sourcePath), fs.readFile(op.targetPath)]);
    return createHash('sha256').update(source).digest('hex') === createHash('sha256').update(target).digest('hex');
  } catch {
    return false;
  }
}

// ─── Prior State ────────────────────────────────────────────

async function capturePriorState(
  targetPath: string,
): Promise<NonNullable<DeploymentOperation['priorState']>> {
  if (!existsSync(targetPath)) {
    return { kind: 'missing' };
  }

  try {
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      return {
        kind: 'symlink',
        symlinkTarget: await fs.readlink(targetPath),
        permissions: stat.mode,
      };
    }
    const content = await fs.readFile(targetPath, 'utf8');
    return {
      kind: 'file',
      content,
      contentHash: createHash('sha256').update(content).digest('hex'),
      permissions: stat.mode,
    };
  } catch {
    return { kind: 'missing' };
  }
}

export async function restorePriorState(
  op: DeploymentOperation,
  priorState: DeploymentOperation['priorState'] | undefined,
): Promise<void> {
  if (!priorState || priorState.kind === 'missing') {
    try {
      if (existsSync(op.targetPath)) {
        await fs.unlink(op.targetPath);
      }
    } catch {
      // Best effort
    }
    return;
  }

  await fs.mkdir(dirname(op.targetPath), { recursive: true });
  if (existsSync(op.targetPath)) await fs.unlink(op.targetPath);
  if (priorState.kind === 'symlink') {
    if (!priorState.symlinkTarget) return;
    await fs.symlink(priorState.symlinkTarget, op.targetPath);
    return;
  }
  await fs.writeFile(op.targetPath, priorState.content ?? '', 'utf8');
  if (priorState.permissions !== undefined) {
    await fs.chmod(op.targetPath, priorState.permissions);
  }
}
