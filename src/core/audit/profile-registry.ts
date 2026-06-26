import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import type { ArtifactType, HarnessProfile, LayoutMode } from "../types";

const builtinNames = ["claude-code.yaml", "codex.yaml", "antigravity.yaml", "opencode.yaml"];

export function loadBuiltInProfiles(): HarnessProfile[] {
  const dir = resolve(import.meta.dir, "../../profiles/builtin");
  return builtinNames.map((name) => loadProfileFile(join(dir, name)));
}

export function loadProfiles(userDir?: string): HarnessProfile[] {
  const profiles = loadBuiltInProfiles();
  if (userDir && existsSync(userDir)) {
    for (const entry of readdirSync(userDir)) {
      if (entry.endsWith(".yaml") || entry.endsWith(".yml")) profiles.push(loadProfileFile(join(userDir, entry)));
    }
  }
  const byId = new Map<string, HarnessProfile>();
  for (const profile of profiles) byId.set(profile.id, profile);
  return [...byId.values()];
}

export function loadProfileFile(path: string): HarnessProfile {
  const parsed = yaml.load(readFileSync(path, "utf8"));
  if (!parsed || typeof parsed !== "object") throw new Error(`Profile is not an object: ${path}`);
  return validateProfile(parsed as Record<string, unknown>, path);
}

export function validateProfile(raw: Record<string, unknown>, path = "<profile>"): HarnessProfile {
  const id = requiredString(raw.id, "id", path);
  const name = requiredString(raw.name, "name", path);
  const version = Number(raw.version);
  if (!Number.isInteger(version)) throw new Error(`Profile ${path} has invalid version`);
  const artifactTypes = raw.artifact_types;
  if (!artifactTypes || typeof artifactTypes !== "object") throw new Error(`Profile ${path} missing artifact_types`);
  for (const [type, config] of Object.entries(artifactTypes as Record<string, unknown>)) {
    if (!isArtifactType(type)) throw new Error(`Profile ${path} has unknown artifact type ${type}`);
    if (!config || typeof config !== "object") throw new Error(`Profile ${path} artifact ${type} must be object`);
    const c = config as Record<string, unknown>;
    if (c.supported === true) {
      if (!["flat", "nested", "config"].includes(String(c.layout))) throw new Error(`Profile ${path} supported ${type} missing valid layout`);
      const targets = c.targets as Record<string, unknown> | undefined;
      if (c.layout !== "config" && (!targets || (!targets.global && !targets.project))) {
        throw new Error(`Profile ${path} supported ${type} missing global or project target`);
      }
    }
  }
  const capabilities = raw.capabilities;
  if (!capabilities || typeof capabilities !== "object") throw new Error(`Profile ${path} missing capabilities`);
  return {
    id,
    name,
    version,
    artifact_types: raw.artifact_types as HarnessProfile["artifact_types"],
    capabilities: capabilities as HarnessProfile["capabilities"],
    deactivation: (raw.deactivation as HarnessProfile["deactivation"]) ?? { strategy: "remove_from_active_target" }
  };
}

function requiredString(value: unknown, field: string, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Profile ${path} missing ${field}`);
  return value;
}

function isArtifactType(value: string): value is ArtifactType {
  return ["skill", "plugin", "agent", "hook", "script", "mcp", "command", "output_style"].includes(value);
}

export function profileTargetFor(profile: HarnessProfile, type: ArtifactType, scope: "global" | "project" = "global"): string | null {
  const target = profile.artifact_types[type]?.targets?.[scope] ?? profile.artifact_types[type]?.targets?.global ?? null;
  return target;
}

export function profileLayoutFor(profile: HarnessProfile, type: ArtifactType): LayoutMode | null {
  return profile.artifact_types[type]?.layout ?? null;
}
