// ─────────────────────────────────────────────────────────────
// Quartermaster — Rollback Engine
// Reverses a recorded deployment by restoring prior states.
// ─────────────────────────────────────────────────────────────

import type { DeploymentRecord } from '@core/types';
import type { Repository } from '@storage/repository';
import { createRecord } from './records';
import { restorePriorState } from './placer';

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 100;

/**
 * Roll back a recorded deployment.
 * Loads the deployment record and reverses each operation.
 */
export async function rollbackDeployment(
  recordId: string,
  repo: Repository,
): Promise<DeploymentRecord> {
  // Find the deployment record
  const deployments = repo.getDeployments();
  const record = deployments.find((d) => d.id === recordId);

  if (!record) {
    throw new RollbackError(`Deployment record '${recordId}' not found`);
  }

  if (record.status === 'rolled-back') {
    throw new RollbackError(`Cannot roll back a rollback (record '${recordId}')`);
  }

  // Execute reverse of each operation
  for (const op of [...record.plan.operations].reverse()) {
    await retryOnError(async () => {
      await restorePriorState(op, op.priorState);
    }, MAX_RETRIES);
  }

  // Record the rollback
  const rollbackRecord = createRecord(record.plan, 'rolled-back');
  repo.recordDeployment(rollbackRecord);

  return rollbackRecord;
}

/**
 * Retry an async operation on failure.
 */
async function retryOnError(fn: () => Promise<void>, retries: number): Promise<void> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await fn();
      return;
    } catch (err) {
      if (attempt < retries) {
        await sleep(RETRY_DELAY_MS);
      } else {
        throw err;
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class RollbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RollbackError';
  }
}
