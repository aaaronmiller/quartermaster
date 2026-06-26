import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DeploymentOperation, DeploymentRecord } from "../types";

export function createRollbackPlan(record: DeploymentRecord): DeploymentOperation[] {
  return [...record.operations].reverse().map((operation) => ({
    kind: "remove",
    ...(operation.target_path ? { target_path: operation.target_path } : {}),
    ...(operation.artifact_id ? { artifact_id: operation.artifact_id } : {}),
    prior_state_ref: operation.prior_state_ref ?? null,
    reason: "rollback"
  }));
}

export function applyRollback(record: DeploymentRecord): DeploymentOperation[] {
  const operations = createRollbackPlan(record);
  for (const operation of operations) {
    if (!operation.target_path) continue;
    if (existsSync(operation.target_path)) rmSync(operation.target_path, { recursive: true });
    if (!operation.prior_state_ref) continue;
    const prior = JSON.parse(operation.prior_state_ref) as { kind: string; content?: string };
    if (prior.kind === "file") {
      mkdirSync(dirname(operation.target_path), { recursive: true });
      writeFileSync(operation.target_path, prior.content ?? "");
    }
  }
  return operations;
}
