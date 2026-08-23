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
          // Remove existing if present (lstat: a dangling symlink is real
          // prior state and must be replaced, not skipped)
          if (await pathExists(op.targetPath)) {
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
          // Remove an existing target first (lstat-based) so a stale copy or
          // dangling symlink is replaced instead of failing with EEXIST.
          if (await pathExists(op.targetPath)) {
            await fs.unlink(op.targetPath);
          }
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await fs.lstat(path);
    return true;
  } catch {
    return false;
  }
}

export async function capturePriorState(
  targetPath: string,
): Promise<NonNullable<DeploymentOperation['priorState']>> {
  // lstat, not existsSync: a dangling symlink is real prior state and must be
  // restored as a symlink, not recorded as missing (which would delete it).
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
      permissions: stat.mode,
    };
  } catch {
    return { kind: 'missing' };
  }
}

/**
 * Refuse to touch a path that resolves outside the directory it claims to be in.
 *
 * On 2026-08-15 a rollback of a codex deployment removed 268 files from
 * `/home/cheta/code/custom-skills`, the operator's own source repository. No
 * operation named that path. The mechanism was symlink traversal: another
 * deployer had populated `~/.codex/skills/<skill>` with links whose
 * `references/` and `scripts/` subdirectories pointed back into custom-skills,
 * so `unlink("~/.codex/skills/x/references/y.md")` followed the directory link
 * and deleted the real file in the source tree.
 *
 * `lstat` does not help here: the final component was a genuine file, and every
 * symlink was in the path *prefix*. Only comparing the fully resolved parent
 * against the intended parent catches it.
 *
 * A deployment writes inside a harness directory. If the real path leaves that
 * directory, something in the prefix is a link out and the operation is refused
 * rather than followed.
 */
async function escapesTarget(targetPath: string): Promise<boolean> {
  try {
    const intended = dirname(targetPath);
    const actual = await fs.realpath(intended);
    // realpath() on the intended parent collapses every symlink in the prefix.
    // Equal means no traversal; different means the write would land elsewhere.
    return actual !== intended;
  } catch {
    // Parent does not exist yet: nothing to traverse into, so nothing to escape.
    return false;
  }
}

export async function restorePriorState(
  op: DeploymentOperation,
  priorState: DeploymentOperation['priorState'] | undefined,
): Promise<void> {
  if (await escapesTarget(op.targetPath)) {
    throw new Error(
      `[quartermaster] refusing to restore ${op.targetPath}: its parent resolves ` +
        `to ${await fs.realpath(dirname(op.targetPath))}, outside the deployment ` +
        `target. A symlink in the path prefix would send this write into another ` +
        `tree. This guard exists because a rollback on 2026-08-15 deleted 268 ` +
        `files from a source repository this way.`,
    );
  }
  // Remove the target even when it is a dangling symlink: existsSync follows
  // symlinks, so a link whose target is missing reports false and would be
  // left behind. lstat sees the link itself.
  const targetExists = async (path: string): Promise<boolean> => {
    try {
      await fs.lstat(path);
      return true;
    } catch {
      return false;
    }
  };

  if (!priorState || priorState.kind === 'missing') {
    try {
      if (await targetExists(op.targetPath)) {
        await fs.unlink(op.targetPath);
      }
    } catch {
      // Best effort
    }
    return;
  }

  await fs.mkdir(dirname(op.targetPath), { recursive: true });
  if (await targetExists(op.targetPath)) await fs.unlink(op.targetPath);
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
