import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ArtifactType } from "../types";

export interface DetectedArtifact {
  type: ArtifactType;
  path: string;
}

const ignored = new Set([".git", "node_modules", ".quartermaster"]);

export function detectArtifacts(root: string): DetectedArtifact[] {
  const out: DetectedArtifact[] = [];
  walk(root, out);
  return uniqueByPath(out);
}

function walk(path: string, out: DetectedArtifact[]): void {
  if (!existsSync(path)) return;
  const stat = statSync(path);
  if (stat.isDirectory()) {
    const base = basename(path);
    if (ignored.has(base)) return;
    if (existsSync(join(path, "SKILL.md"))) out.push({ type: "skill", path });
    if (existsSync(join(path, "plugin.yaml")) || existsSync(join(path, "plugin.yml")) || existsSync(join(path, "plugin.json"))) out.push({ type: "plugin", path });
    if (existsSync(join(path, "agent.yaml")) || existsSync(join(path, "agent.yml"))) out.push({ type: "agent", path });
    for (const entry of readdirSync(path)) walk(join(path, entry), out);
    return;
  }
  const base = basename(path);
  const dir = basename(dirname(path));
  if (base === "AGENTS.md" || base === "CLAUDE.md") out.push({ type: "output_style", path });
  else if (base.endsWith(".agent.yaml") || dir === "agents") out.push({ type: "agent", path });
  else if (base.endsWith(".hook.yaml") || dir === "hooks") out.push({ type: "hook", path });
  else if (base.endsWith(".mcp.json") || base.includes("mcp")) out.push({ type: "mcp", path });
  else if (base.endsWith(".command.md") || dir === "commands") out.push({ type: "command", path });
  else if (base.endsWith(".sh") || base.endsWith(".ts") || base.endsWith(".js") || dir === "scripts") out.push({ type: "script", path });
}

function uniqueByPath(items: DetectedArtifact[]): DetectedArtifact[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.type}:${item.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
