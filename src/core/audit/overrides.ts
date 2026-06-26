import type { CompatibilityVerdict } from "../types";

export function applyOverride(verdict: CompatibilityVerdict, note: string): CompatibilityVerdict {
  return { ...verdict, result: "deployable", reason: verdict.reason, override_note: note };
}
