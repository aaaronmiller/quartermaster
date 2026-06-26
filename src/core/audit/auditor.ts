import type { Artifact, CompatibilityVerdict, HarnessProfile } from "../types";
import { nowIso } from "../types";
import { capabilityProblems } from "./capabilities";
import { detectTransforms } from "./transforms";
import type { Repository } from "../../storage/repository";

export function computeVerdict(artifact: Artifact, profile: HarnessProfile): CompatibilityVerdict {
  const typeProfile = profile.artifact_types[artifact.type];
  if (!typeProfile?.supported) {
    return verdict(artifact.id, profile.id, "incompatible", `target does not support ${artifact.type}`, null);
  }
  const capabilityIssues = capabilityProblems(artifact, profile);
  const hardIssues = capabilityIssues.filter((issue) => !issue.includes("translation"));
  if (hardIssues.length) return verdict(artifact.id, profile.id, "incompatible", hardIssues.join("; "), null);
  const transforms = detectTransforms(artifact, profile);
  if (capabilityIssues.length || transforms.length) {
    const transformation = transforms[0] ?? capabilityIssues[0]?.replace("target requires ", "").replaceAll(" ", "-") ?? "transform";
    return verdict(artifact.id, profile.id, "transform", [...capabilityIssues, ...transforms.map((t) => `requires ${t}`)].join("; "), transformation);
  }
  return verdict(artifact.id, profile.id, "deployable", null, null);
}

export function auditArtifacts(repo: Repository, profiles: HarnessProfile[]): CompatibilityVerdict[] {
  const verdicts: CompatibilityVerdict[] = [];
  for (const artifact of repo.listArtifacts()) {
    for (const profile of profiles) {
      const result = computeVerdict(artifact, profile);
      repo.upsertVerdict(result);
      verdicts.push(result);
    }
  }
  return verdicts;
}

function verdict(artifact_id: string, harness_id: string, result: CompatibilityVerdict["result"], reason: string | null, transformation: string | null): CompatibilityVerdict {
  return { artifact_id, harness_id, result, reason, transformation, override_note: null, computed_at: nowIso() };
}
