// ─────────────────────────────────────────────────────────────
// Quartermaster — SKILL.md Frontmatter Parser for Level0
// Extracts name, one-line description, triggers, cost hint.
// ─────────────────────────────────────────────────────────────

import { readFileSync, existsSync } from 'node:fs';
import { load as parseYaml } from 'js-yaml';
import type { CostHint, SkillStatus } from './types';

export interface ParsedSkillMd {
  name: string;
  description: string;
  oneLine: string;
  triggers: string[];
  costHint: CostHint;
  frontmatter: Record<string, unknown>;
  body: string;
  references: string[];
  scripts: string[];
  assets: string[];
}

function firstLine(s: string): string {
  const normalized = s.replace(/\s+/g, ' ').trim();
  const period = normalized.indexOf('. ');
  if (period > 20 && period < 240) return normalized.slice(0, period + 1);
  return normalized.slice(0, 220);
}

function extractTriggers(description: string): string[] {
  const triggers: string[] = [];
  // Quoted phrases: "phrase" or 'phrase' or `phrase`
  const quoted = description.matchAll(/"([^"]{3,80})"/g);
  for (const m of quoted) if (m[1]) triggers.push(m[1].trim().toLowerCase());
  const single = description.matchAll(/'([^']{3,80})'/g);
  for (const m of single) if (m[1]) triggers.push(m[1].trim().toLowerCase());
  // Use when: ... triggers: ... patterns
  const useWhen = description.match(/Use when:\s*([^.\n]+)/i);
  if (useWhen?.[1]) {
    for (const p of useWhen[1].split(/[,;]/)) {
      const t = p.trim().toLowerCase().replace(/^"+|"+$/g, '');
      if (t.length >= 3 && t.length <= 80 && !triggers.includes(t)) triggers.push(t);
    }
  }
  const trigLine = description.match(/Triggers?:\s*([^.\n]+)/i);
  if (trigLine?.[1]) {
    for (const p of trigLine[1].split(/[,;]/)) {
      const t = p.trim().toLowerCase().replace(/^"+|"+$/g, '');
      if (t.length >= 3 && t.length <= 80 && !triggers.includes(t)) triggers.push(t);
    }
  }
  // Deduplicate, cap
  return [...new Set(triggers)].slice(0, 40);
}

function inferCostHint(description: string, triggers: string[]): CostHint {
  const d = description.toLowerCase();
  if (d.includes('always') || d.includes('automatic activation')) return 'always';
  if (d.includes('expensive') || d.includes('model') || d.includes('quota')) return 'expensive';
  if (triggers.length > 20) return 'cheap';
  if (triggers.length > 10) return 'on-demand';
  return 'on-demand';
}

export function parseSkillMd(path: string): ParsedSkillMd | null {
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
  // Frontmatter: ---\n yaml \n---\n body
  const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!fmMatch) {
    return {
      name: path.split('/').pop()?.replace(/\.md$/i, '') ?? 'unknown',
      description: firstLine(raw),
      oneLine: firstLine(raw),
      triggers: extractTriggers(raw),
      costHint: 'unknown',
      frontmatter: {},
      body: raw,
      references: [],
      scripts: [],
      assets: [],
    };
  }
  const [, yamlRaw, body] = fmMatch;
  let fm: Record<string, unknown> = {};
  try {
    fm = (parseYaml(yamlRaw ?? '') as Record<string, unknown>) ?? {};
  } catch {
    fm = {};
  }
  const name = typeof fm.name === 'string' ? fm.name : path.split('/').pop()?.replace(/\.md$/i, '') ?? 'unknown';
  const description = typeof fm.description === 'string' ? fm.description : firstLine(body ?? '');
  const oneLine = firstLine(description);
  const triggers = extractTriggers(description);
  const costHint = inferCostHint(description, triggers);
  // References/scripts/assets declared in SKILL.md body
  const references: string[] = [];
  const scripts: string[] = [];
  const assets: string[] = [];
  const refMatch = body?.matchAll(/references\/[^\s"')\]]+/g);
  if (refMatch) for (const m of refMatch) references.push(m[0]);
  const scriptMatch = body?.matchAll(/scripts\/[^\s"')\]]+/g);
  if (scriptMatch) for (const m of scriptMatch) scripts.push(m[0]);
  const assetMatch = body?.matchAll(/assets\/[^\s"')\]]+/g);
  if (assetMatch) for (const m of assetMatch) assets.push(m[0]);

  return { name, description, oneLine, triggers, costHint, frontmatter: fm, body: body ?? '', references: [...new Set(references)], scripts: [...new Set(scripts)], assets: [...new Set(assets)] };
}

export function resolveSkillStatus(organizationalPath: string, sourceEnabled: boolean | undefined, lifecycle: string | undefined): { status: SkillStatus; reason?: string } {
  if (organizationalPath.includes('staged-for-deletion') || organizationalPath.includes('staged_for_deletion')) {
    return { status: 'archived', reason: 'staged-for-deletion — human retired but not yet removed' };
  }
  if (sourceEnabled === false) {
    if (lifecycle === 'deprecated') return { status: 'archived', reason: 'source deprecated and disabled' };
    return { status: 'disabled', reason: 'source disabled in sources.yaml' };
  }
  if (lifecycle === 'deprecated') return { status: 'archived', reason: 'lifecycle deprecated' };
  if (lifecycle === 'proposed') return { status: 'proposed', reason: 'proposed, not yet active' };
  // superseded handled higher up via dedupe/superseded_by map
  return { status: 'active' };
}
