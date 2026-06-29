// ─────────────────────────────────────────────────────────────
// Quartermaster — Deployment Records
// Records applied deployments and renders dry-run summaries.
// ─────────────────────────────────────────────────────────────

import type { DeploymentPlan, DeploymentRecord } from '@core/types';
import type { Repository } from '@storage/repository';

/**
 * Validate that the plan has been confirmed by the user.
 */
export function verifyConfirmation(confirm: boolean): void {
  if (!confirm) {
    throw new DeployRecordError(
      'Deployment not confirmed. Run with confirm=true or use interactive mode.',
    );
  }
}

/**
 * Create a deployment record from a plan and status.
 */
export function createRecord(
  plan: DeploymentPlan,
  status: DeploymentRecord['status'],
): DeploymentRecord {
  return {
    id: generateRecordId(),
    timestamp: new Date().toISOString(),
    harness: plan.harness,
    plan,
    status,
  };
}

/**
 * Store a deployment record in the repository.
 */
export function storeRecord(record: DeploymentRecord, repo: Repository): void {
  repo.recordDeployment(record);
}

/**
 * Render a dry-run summary for a deployment plan.
 */
export function dryRunPlan(plan: DeploymentPlan): string {
  const lines: string[] = [];
  lines.push(`┌─ Deployment Plan: ${plan.harness}`);
  lines.push(`│`);
  lines.push(`│   Operations: ${plan.operations.length}`);

  const linkCount = plan.operations.filter((o) => o.method === 'link').length;
  const copyCount = plan.operations.filter((o) => o.method === 'copy').length;
  const transformCount = plan.operations.filter((o) => o.transform).length;

  lines.push(`│     Link:  ${linkCount}`);
  lines.push(`│     Copy:  ${copyCount}`);
  lines.push(`│     Transform: ${transformCount}`);
  lines.push(`│`);

  if (plan.excluded.length > 0) {
    lines.push(`│   Excluded: ${plan.excluded.length}`);
    for (const e of plan.excluded) {
      lines.push(`│     • ${e.artifact}: ${e.reason}`);
    }
    lines.push(`│`);
  }

  if (plan.operations.length === 0) {
    lines.push(`│   ⚠ Nothing to deploy`);
    lines.push(`│`);
  } else {
    for (const op of plan.operations) {
      lines.push(`│   ${op.method === 'link' ? '→' : '⇒'} ${op.sourcePath} → ${op.targetPath}`);
      if (op.transform) {
        lines.push(`│      transform: ${op.transform}`);
      }
    }
    lines.push(`│`);
  }

  lines.push(`└─ End of plan`);
  return lines.join('\n');
}

// ─── Helpers ───────────────────────────────────────────────

let counter = 0;

function generateRecordId(): string {
  counter++;
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `deploy-${ts}-${rand}-${counter}`;
}

export class DeployRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeployRecordError';
  }
}
