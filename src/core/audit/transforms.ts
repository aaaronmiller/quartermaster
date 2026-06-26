import type { Artifact, HarnessProfile } from "../types";

export function detectTransforms(artifact: Artifact, profile: HarnessProfile): string[] {
  const transforms: string[] = [];
  const artifactProfile = profile.artifact_types[artifact.type];
  if (!artifactProfile?.supported) return transforms;
  if (artifactProfile.layout === "flat" && artifact.org_path.includes("/")) transforms.push("flatten");
  for (const required of artifact.required_capabilities) {
    const cap = profile.capabilities[required.name];
    if (required.format && cap?.config_formats?.length && !cap.config_formats.includes(required.format)) {
      transforms.push(`translate:${required.name}:${cap.config_formats[0]}`);
    }
  }
  return [...new Set(transforms)];
}
