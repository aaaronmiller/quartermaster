import { spawnSync } from "node:child_process";
import type { Auditor } from "../types";

export function runAuditor(auditor: Auditor, artifactPath: string): { ok: boolean; output: string } {
  if (!auditor.enabled) return { ok: true, output: "skipped" };
  const [command, ...args] = auditor.invocation;
  if (!command) return { ok: false, output: "auditor invocation is empty" };
  const result = spawnSync(command, [...args, artifactPath], { encoding: "utf8" });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}
