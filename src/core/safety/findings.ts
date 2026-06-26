import { nowIso, type AuditFinding } from "../types";

export function normalizeFinding(artifact_id: string, auditor_id: string, output: string): AuditFinding {
  const severity = output.toLowerCase().includes("critical")
    ? "critical"
    : output.toLowerCase().includes("high")
      ? "high"
      : output.toLowerCase().includes("medium")
        ? "medium"
        : output.toLowerCase().includes("low")
          ? "low"
          : "info";
  return {
    artifact_id,
    auditor_id,
    score: severity === "critical" ? 1 : severity === "high" ? 0.8 : severity === "medium" ? 0.5 : severity === "low" ? 0.2 : 0,
    severity,
    findings: { output },
    evaluated_at: nowIso()
  };
}
