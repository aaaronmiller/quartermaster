import type { ArtifactType, CapabilityRequirement } from "../types";

export function inferCapabilities(type: ArtifactType, raw: string): CapabilityRequirement[] {
  const lower = raw.toLowerCase();
  const caps: CapabilityRequirement[] = [];
  if (type === "hook" || lower.includes("hooks:") || lower.includes("hook")) {
    const dialect = inferDialect(raw);
    caps.push(dialect ? { name: "hooks", dialect } : { name: "hooks" });
  }
  if (type === "mcp" || lower.includes("mcp")) caps.push({ name: "mcp", format: lower.includes("toml") ? "toml" : lower.includes("yaml") ? "yaml" : "json" });
  if (type === "script" || lower.includes("bash(") || lower.includes("exec") || lower.includes("#!/")) caps.push({ name: "shell" });
  if (type === "plugin") caps.push({ name: "plugins" });
  return caps;
}

export function inferRiskFlags(type: ArtifactType, raw: string): string[] {
  const lower = raw.toLowerCase();
  const flags = new Set<string>();
  if (type === "script" || lower.includes("#!/")) flags.add("executable");
  if (lower.includes("curl ") || lower.includes("wget ")) flags.add("network");
  if (lower.includes("rm ") || lower.includes("delete") || lower.includes("drop ")) flags.add("destructive");
  if (lower.includes("api_key") || lower.includes("secret") || lower.includes("token")) flags.add("secret_access");
  return [...flags];
}

function inferDialect(raw: string): string | undefined {
  const lower = raw.toLowerCase();
  if (lower.includes("claude")) return "claude-code";
  if (lower.includes("opencode")) return "opencode";
  if (lower.includes("codex")) return "codex";
  return undefined;
}
