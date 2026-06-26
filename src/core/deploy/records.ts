import type { DeploymentPlan, DeploymentRecord } from "../types";
import { nowIso, stableId } from "../types";
import type { AppliedOperation } from "./placer";

export function createDeploymentRecord(plan: DeploymentPlan, operations: AppliedOperation[]): DeploymentRecord {
  return {
    id: stableId("deployment", plan.id, nowIso()),
    harness_id: plan.harness_id,
    scope: plan.scope,
    plan_snapshot: plan,
    applied_at: nowIso(),
    operations,
    prior_state_ref: JSON.stringify(operations.map((op) => ({ target_path: op.target_path, prior_state_ref: op.prior_state_ref })))
  };
}
