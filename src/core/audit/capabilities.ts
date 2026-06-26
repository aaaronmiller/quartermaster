import type { Artifact, HarnessProfile } from "../types";

export function capabilityProblems(artifact: Artifact, profile: HarnessProfile): string[] {
  const problems: string[] = [];
  for (const required of artifact.required_capabilities) {
    const provided = profile.capabilities[required.name];
    if (!provided?.supported) {
      problems.push(`target does not support ${required.name}`);
      continue;
    }
    if (required.dialect && provided.dialects?.length && !provided.dialects.includes(required.dialect)) {
      problems.push(`target does not support ${required.name} dialect ${required.dialect}`);
    }
    if (required.format && provided.config_formats?.length && !provided.config_formats.includes(required.format)) {
      problems.push(`target requires ${required.name} config translation from ${required.format}`);
    }
  }
  return problems;
}
