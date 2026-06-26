import { join, resolve } from "node:path";
import type { Artifact, CompatibilityVerdict, DeploymentPlan, HarnessProfile } from "../types";
import { nowIso, stableId } from "../types";
import { flattenedName } from "./flatten";
import { profileLayoutFor, profileTargetFor } from "../audit/profile-registry";

export function createDeploymentPlan(input: {
  artifacts: Artifact[];
  verdicts: CompatibilityVerdict[];
  profile: HarnessProfile;
  targetRoot?: string;
  scope?: string;
}): DeploymentPlan {
  const verdictByArtifact = new Map(input.verdicts.filter((v) => v.harness_id === input.profile.id).map((v) => [v.artifact_id, v]));
  const placements = input.artifacts.map((artifact) => {
    const verdict = verdictByArtifact.get(artifact.id);
    if (!verdict || verdict.result === "incompatible") {
      return {
        kind: "skip" as const,
        artifact_id: artifact.id,
        source_path: artifact.abs_path,
        method: "skip" as const,
        reason: verdict?.reason ?? "no compatibility verdict"
      };
    }
    const targetBase = input.targetRoot ?? profileTargetFor(input.profile, artifact.type) ?? `.quartermaster/targets/${input.profile.id}/${artifact.type}`;
    const layout = profileLayoutFor(input.profile, artifact.type);
    const targetName = layout === "flat" ? flattenedName(artifact) : artifact.org_path;
    const targetPath = resolve(join(expandHome(targetBase), targetName));
    return {
      kind: verdict.result === "transform" ? "transform" as const : "link" as const,
      artifact_id: artifact.id,
      source_path: artifact.abs_path,
      target_path: targetPath,
      method: artifact.type === "mcp" || layout === "config" ? "write_config" as const : "symlink" as const,
      transformation: verdict.transformation,
      reason: verdict.reason
    };
  });
  const id = stableId("plan", input.profile.id, JSON.stringify(placements), nowIso());
  return {
    id,
    harness_id: input.profile.id,
    scope: input.scope ?? "all",
    placements,
    requires_confirmation: placements.some((op) => op.kind !== "skip"),
    created_at: nowIso()
  };
}

function expandHome(path: string): string {
  if (path.startsWith("~/")) return join(process.env.HOME ?? ".", path.slice(2));
  return path;
}
