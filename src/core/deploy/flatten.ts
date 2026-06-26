import { basename } from "node:path";
import type { Artifact } from "../types";

export function flattenedName(artifact: Artifact): string {
  const parts = artifact.org_path.split("/");
  if (parts.at(-1) === "SKILL.md") return parts.at(-2) ?? basename(artifact.org_path);
  return basename(artifact.org_path);
}

export function findFlattenConflicts(artifacts: Artifact[]): Map<string, Artifact[]> {
  const byName = new Map<string, Artifact[]>();
  for (const artifact of artifacts) {
    const name = flattenedName(artifact);
    byName.set(name, [...(byName.get(name) ?? []), artifact]);
  }
  for (const [name, group] of byName) {
    if (group.length < 2) byName.delete(name);
  }
  return byName;
}
