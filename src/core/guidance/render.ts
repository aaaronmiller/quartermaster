import type { Pipeline } from "../types";

export const managedStart = "<!-- QUARTERMASTER MANAGED START -->";
export const managedEnd = "<!-- QUARTERMASTER MANAGED END -->";

export function renderGuidance(existing: string, pipelines: Pipeline[]): string {
  const managed = [
    managedStart,
    ...pipelines.map((pipeline) => `## ${pipeline.name}\n${pipeline.directive}`).filter(Boolean),
    managedEnd
  ].join("\n\n");
  if (existing.includes(managedStart) && existing.includes(managedEnd)) {
    const before = existing.slice(0, existing.indexOf(managedStart)).trimEnd();
    const after = existing.slice(existing.indexOf(managedEnd) + managedEnd.length).trimStart();
    return [before, managed, after].filter(Boolean).join("\n\n") + "\n";
  }
  return [existing.trimEnd(), managed].filter(Boolean).join("\n\n") + "\n";
}
