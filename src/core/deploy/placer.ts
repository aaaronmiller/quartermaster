import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, copyFileSync, cpSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { DeploymentOperation } from "../types";

export interface AppliedOperation extends DeploymentOperation {
  prior_state_ref: string | null;
}

export function capturePriorState(path: string): string | null {
  if (!existsSync(path)) return null;
  const stat = lstatSync(path);
  if (stat.isDirectory()) return JSON.stringify({ kind: "directory" });
  if (stat.isSymbolicLink()) return JSON.stringify({ kind: "symlink", target: readFileSync(path, "utf8") });
  return JSON.stringify({ kind: "file", content: readFileSync(path, "utf8") });
}

export function applyPlacement(operation: DeploymentOperation): AppliedOperation {
  if (!operation.target_path || !operation.source_path || operation.kind === "skip") return { ...operation, prior_state_ref: null };
  mkdirSync(dirname(operation.target_path), { recursive: true });
  const prior = capturePriorState(operation.target_path);
  if (existsSync(operation.target_path)) rmSync(operation.target_path, { recursive: true });
  if (operation.method === "copy") {
    const stat = lstatSync(operation.source_path);
    if (stat.isDirectory()) cpSync(operation.source_path, operation.target_path, { recursive: true });
    else copyFileSync(operation.source_path, operation.target_path);
  } else if (operation.method === "write_config") {
    writeFileSync(operation.target_path, JSON.stringify({ source: operation.source_path, artifact_id: operation.artifact_id }, null, 2));
  } else {
    try {
      symlinkSync(operation.source_path, operation.target_path);
    } catch {
      const stat = lstatSync(operation.source_path);
      if (stat.isDirectory()) cpSync(operation.source_path, operation.target_path, { recursive: true });
      else copyFileSync(operation.source_path, operation.target_path);
      operation.method = "copy";
    }
  }
  return { ...operation, prior_state_ref: prior };
}
