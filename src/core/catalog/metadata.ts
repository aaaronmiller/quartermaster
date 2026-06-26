import { readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import yaml from "js-yaml";
import type { ArtifactType } from "../types";

export interface ParsedMetadata {
  name: string;
  description: string | null;
  version: string | null;
  raw: string;
}

export function parseMetadata(type: ArtifactType, path: string): ParsedMetadata {
  const contentPath = statSync(path).isDirectory() ? preferredFile(type, path) : path;
  const raw = readFileSync(contentPath, "utf8");
  const frontmatter = parseFrontmatter(raw);
  const name = stringValue(frontmatter.name) ?? basename(path).replace(/\.(md|yaml|yml|json|ts|js|sh)$/i, "");
  const description = stringValue(frontmatter.description) ?? firstHeadingOrLine(raw);
  const version = stringValue(frontmatter.version);
  return { name, description, version, raw };
}

function preferredFile(type: ArtifactType, dir: string): string {
  if (type === "skill") return join(dir, "SKILL.md");
  const candidates = ["plugin.yaml", "plugin.yml", "plugin.json", "agent.yaml", "agent.yml"];
  for (const name of candidates) {
    try {
      statSync(join(dir, name));
      return join(dir, name);
    } catch {}
  }
  return join(dir, "SKILL.md");
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  if (!raw.startsWith("---")) return {};
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return {};
  const block = raw.slice(3, end);
  const parsed = yaml.load(block);
  return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstHeadingOrLine(raw: string): string | null {
  for (const line of raw.split(/\r?\n/)) {
    const clean = line.replace(/^#+\s*/, "").trim();
    if (clean && clean !== "---") return clean.slice(0, 240);
  }
  return null;
}
