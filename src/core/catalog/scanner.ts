// ─────────────────────────────────────────────────────────────
// Quartermaster — Catalog Scanner
// Walks library roots, detects artifact types by convention,
// computes hashes + organizational paths, and returns a ScanResult.
// Detection is convention-driven (suffix/name) with sensible
// fallbacks; metadata is parsed with js-yaml for robustness.
// ─────────────────────────────────────────────────────────────

import { createHash } from 'node:crypto';
import { existsSync, promises as fs, realpathSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import type { Artifact, ArtifactType, ScanResult } from '@core/types';
import type { Repository } from '@storage/repository';
import { load as parseYaml } from 'js-yaml';
import { inferCapabilities } from './capabilities';
import { classifyArtifactMetadata } from '@core/classification/classify';

export interface ScannerOptions {
  /** Maximum directory depth. Default: 100 */
  maxDepth?: number;
  /** Directory names to skip. */
  skipPatterns?: string[];
}

const DEFAULT_SKIP = ['.git', 'node_modules', '.venv', '__pycache__', 'dist', 'build', '.gemini-images', 'tests', 'test', 'fixtures', '__tests__', '__snapshots__'];

const VISITED_INODES = new Set<string>();

interface Capability {
  type: string;
  dialect: string;
  metadata?: Record<string, unknown>;
}

interface DetectedArtifact {
  type: ArtifactType;
  name: string;
  path: string;
  metadata: Record<string, unknown>;
  capabilities: Capability[];
}

// ─── Scanner Implementation ─────────────────────────────────

export async function scanRoots(
  roots: string[],
  repo: Repository,
  options?: ScannerOptions,
): Promise<ScanResult> {
  VISITED_INODES.clear();
  const maxDepth = options?.maxDepth ?? 100;
  const skip = options?.skipPatterns ?? DEFAULT_SKIP;

  // Track which root each file came from so the organizational path
  // can be recorded relative to that root (FR-002).
  const allFiles: Array<{ file: string; root: string }> = [];

  for (const root of roots) {
    if (!existsSync(root)) {
      throw new ScannerError(`Root does not exist: ${root}`);
    }
    const stat = statSync(root);
    if (stat.isFile()) {
      allFiles.push({ file: root, root: dirname(root) });
    } else {
      const collected: string[] = [];
      await collectFiles(root, 0, maxDepth, skip, collected);
      for (const f of collected) allFiles.push({ file: f, root });
    }
  }

  const result: ScanResult = { added: [], changed: [], removed: [], errors: [] };

  // Phase 1 (async, no DB writes): detect type, hash, and classify each file.
  // Phase 2 batches all upserts into one transaction — on a 1000-artifact
  // library this turns 1000 auto-committed writes into a single commit
  // (NFR-001: full scan < 10s).
  const pending: Artifact[] = [];
  const claimedIds = new Set<string>();
  for (const { file: filePath, root } of allFiles) {
    try {
      const detected = await detectArtifactType(filePath);
      if (!detected) continue;

      const packageInfo = await computeArtifactDigest(filePath, detected.type);
      const hash = packageInfo.hash;
      const existing = repo.getArtifactByPath(filePath);
      const moved = existing
        ? null
        : (repo
            .findArtifactsByHash(hash)
            .find((candidate) => !existsSync(candidate.path) && !claimedIds.has(candidate.id)) ?? null);
      const identity = existing ?? moved;
      const isNew = identity === null;

      const artifact = buildArtifact(
        detected,
        hash,
        packageInfo.size,
        filePath,
        orgPath(root, filePath),
        identity,
        packageInfo.members,
      );
      claimedIds.add(artifact.id);

      if (isNew) result.added.push(artifact);
      else if (hash !== identity.hash || moved !== null) result.changed.push(artifact);
      // unchanged: still upserted (idempotent), but not reported in the diff

      pending.push(artifact);
    } catch (err) {
      result.errors.push({ path: filePath, error: err instanceof Error ? err.message : String(err) });
    }
  }

  repo.transaction(() => {
    const pendingPaths = new Set(pending.map((artifact) => artifact.path));
    const pendingIds = new Set(pending.map((artifact) => artifact.id));
    for (const artifact of repo.listArtifacts()) {
      if (
        isWithinRoots(artifact.path, roots) &&
        !pendingPaths.has(artifact.path) &&
        !pendingIds.has(artifact.id)
      ) {
        repo.deleteArtifact(artifact.id);
        result.removed.push(artifact);
      }
    }
    for (const artifact of pending) repo.upsertArtifact(artifact);
  });

  return result;
}

/**
 * Incremental rescan: re-hash cataloged paths, detect changed/removed.
 * Unchanged artifacts are not rewritten.
 */
export async function rescanIncremental(repo: Repository): Promise<ScanResult> {
  const artifacts = repo.listArtifacts();
  const result: ScanResult = { added: [], changed: [], removed: [], errors: [] };

  for (const art of artifacts) {
    try {
      if (!existsSync(art.path)) {
        repo.deleteArtifact(art.id);
        result.removed.push(art);
        continue;
      }
      const digest = await computeArtifactDigest(art.path, art.type);
      const newHash = digest.hash;
      if (newHash !== art.hash) {
        const detected = await detectArtifactType(art.path);
        if (detected) {
          const updated = buildArtifact(
            detected,
            newHash,
            digest.size,
            art.path,
            art.organizationalPath,
            art,
            digest.members,
          );
          repo.upsertArtifact(updated);
          result.changed.push(updated);
        }
      }
    } catch (err) {
      result.errors.push({ path: art.path, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

// ─── File Collection ────────────────────────────────────────

async function collectFiles(
  dir: string,
  depth: number,
  maxDepth: number,
  skip: string[],
  out: string[],
): Promise<void> {
  if (depth > maxDepth) return;

  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return; // permission denied — skip
  }

  const skillEntrypoint = entries.find((entry) => entry.toLowerCase() === 'skill.md');
  if (skillEntrypoint) {
    out.push(`${dir}/${skillEntrypoint}`);
    for (const entry of entries) {
      if (entry === skillEntrypoint || skip.includes(entry) || entry.startsWith('.')) continue;
      const child = `${dir}/${entry}`;
      try {
        if ((await fs.stat(child)).isDirectory()) await collectNestedSkillEntrypoints(child, out, skip);
      } catch {
        // Ignore unreadable package members.
      }
    }
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith('.') && entry !== '.mcp.json') continue; // skip hidden (except known config)
    if (skip.includes(entry)) continue;

    const fullPath = `${dir}/${entry}`;
    let isDir = false;

    try {
      const stat = await fs.lstat(fullPath);
      if (stat.isSymbolicLink()) {
        try {
          const real = await fs.realpath(fullPath);
          const rstat = await fs.stat(real);
          const key = `${rstat.dev}:${rstat.ino}`;
          if (VISITED_INODES.has(key)) continue; // loop guard
          VISITED_INODES.add(key);
          isDir = rstat.isDirectory();
        } catch {
          continue; // broken symlink
        }
      } else {
        isDir = stat.isDirectory();
      }
    } catch {
      continue;
    }

    if (isDir) await collectFiles(fullPath, depth + 1, maxDepth, skip, out);
    else out.push(fullPath);
  }
}

function isWithinRoots(path: string, roots: string[]): boolean {
  const normalized = resolve(path);
  return roots.some((root) => {
    const candidate = resolve(root);
    return normalized === candidate || normalized.startsWith(`${candidate}/`);
  });
}

async function collectNestedSkillEntrypoints(dir: string, out: string[], skip: string[]): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const entrypoint = entries.find((entry) => entry.toLowerCase() === 'skill.md');
  if (entrypoint) out.push(`${dir}/${entrypoint}`);
  for (const entry of entries) {
    if (entry === entrypoint || skip.includes(entry) || entry.startsWith('.')) continue;
    const child = `${dir}/${entry}`;
    try {
      if ((await fs.stat(child)).isDirectory()) await collectNestedSkillEntrypoints(child, out, skip);
    } catch {
      // Ignore unreadable nested directories.
    }
  }
}

// ─── Artifact Type Detection (convention-driven) ────────────

async function detectArtifactType(filePath: string): Promise<DetectedArtifact | null> {
  const fileName = basename(filePath);
  const lower = fileName.toLowerCase();

  // 1. Slash command: *.command.md
  if (lower.endsWith('.command.md')) {
    const meta = await safeFrontmatter(filePath);
    return mk('slash-command', str(meta.name) ?? stripExt(fileName), filePath, meta, [
      { type: 'commands', dialect: 'claude' },
    ]);
  }

  // 2. Output style: AGENTS.md, CLAUDE.md, *.style.md
  if (fileName === 'AGENTS.md' || fileName === 'CLAUDE.md' || lower.endsWith('.style.md')) {
    const meta = await safeFrontmatter(filePath);
    return mk('output-style', str(meta.name) ?? stripExt(fileName), filePath, meta, [
      { type: 'output-style', dialect: 'generic' },
    ]);
  }

  // 3. Skill package entrypoint: SKILL.md or a standalone *.skill.md file.
  if (lower === 'skill.md' || lower.endsWith('.skill.md')) {
    const content = await readText(filePath);
    const meta = content.startsWith('---') ? parseFrontmatter(content) : {};
    if (detectsMcpReference(content)) meta.referencesMcp = true;
    return mk('skill', str(meta.name) ?? basename(dirname(filePath)), filePath, meta, [
      { type: 'skill', dialect: 'agent-md' },
    ]);
  }
  // 4. Agent: *.agent.{yaml,yml}, manifest.{yaml,yml}
  if (/\.agent\.ya?ml$/.test(lower) || lower === 'manifest.yaml' || lower === 'manifest.yml') {
    const meta = await safeYaml(filePath);
    return mk('agent', str(meta.name) ?? basename(dirname(filePath)), filePath, meta, [
      { type: 'agent-config', dialect: 'generic' },
    ]);
  }

  // 5. Hook: *.hook.{yaml,yml,json}, hook-*
  if (/\.hook\.(ya?ml|json)$/.test(lower) || fileName.startsWith('hook-')) {
    const meta = lower.endsWith('.json') ? await safeJson(filePath) : await safeYaml(filePath);
    return mk('hook', str(meta.name) ?? stripExt(fileName), filePath, meta, [
      { type: 'hooks', dialect: str(meta.dialect) ?? 'claude' },
    ]);
  }

  // 6. MCP config: *.mcp.json, mcp-servers.json, .mcp.json
  if (/\.mcp\.json$/.test(lower) || fileName === 'mcp-servers.json' || fileName === '.mcp.json') {
    const cfg = await safeJson(filePath);
    const multi = Array.isArray(cfg) || typeof cfg.mcpServers === 'object';
    return mk('mcp-config', str(cfg.name) ?? fileName, filePath, { mcpType: multi ? 'multi' : 'single' }, [
      { type: 'mcp', dialect: multi ? 'multi-server' : 'single-server' },
    ]);
  }

  // 7. Plugin: plugin.{yaml,yml,json}, or package.json with a `type`
  if (lower === 'plugin.yaml' || lower === 'plugin.yml' || lower === 'plugin.json') {
    const meta = lower.endsWith('.json') ? await safeJson(filePath) : await safeYaml(filePath);
    return mk('plugin', str(meta.name) ?? basename(dirname(filePath)), filePath, meta, pluginCaps(meta));
  }
  if (fileName === 'package.json') {
    const pkg = await safeJson(filePath);
    if (pkg.type) {
      return mk('plugin', str(pkg.name) ?? basename(dirname(filePath)), filePath, pkg, pluginCaps(pkg));
    }
  }

  // 8. Script: shell / interpreted executables
  const lang = scriptLanguage(lower);
  if (lang) return mk('script', fileName, filePath, {}, [{ type: 'scripts', dialect: lang }]);

  return null; // unrecognized
}

// ─── Helpers ───────────────────────────────────────────────

function mk(
  type: ArtifactType,
  name: string,
  path: string,
  metadata: Record<string, unknown>,
  capabilities: Capability[],
): DetectedArtifact {
  return { type, name, path, metadata, capabilities };
}

function pluginCaps(meta: Record<string, unknown>): Capability[] {
  const components = (meta.components as Array<{ type: string }>) ?? [];
  const caps: Capability[] = components.map((c) => ({ type: c.type || 'unknown', dialect: 'plugin' }));
  if (components.some((c) => c.type === 'hook')) caps.push({ type: 'hooks', dialect: 'plugin' });
  return caps.length > 0 ? caps : [{ type: 'plugin', dialect: 'generic' }];
}

function scriptLanguage(lower: string): string | null {
  if (lower.endsWith('.sh') || lower.endsWith('.bash')) return 'bash';
  if (lower.endsWith('.zsh')) return 'zsh';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.rb')) return 'ruby';
  if (lower.endsWith('.mjs') || lower.endsWith('.cjs') || lower.endsWith('.js')) return 'node';
  if (lower.endsWith('.ts')) return 'typescript';
  return null;
}

function stripExt(f: string): string {
  return f.replace(/\.[^.]+$/, '');
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** Organizational path: the artifact's directory relative to the library root. */
function orgPath(root: string, filePath: string): string {
  const rel = relative(root, dirname(filePath));
  return rel === '' ? '.' : rel;
}

async function readText(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

async function safeYaml(filePath: string): Promise<Record<string, unknown>> {
  const data = parseYamlSafe(await readText(filePath));
  return data;
}

async function safeJson(filePath: string): Promise<Record<string, unknown>> {
  try {
    const data = JSON.parse(await readText(filePath));
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function safeFrontmatter(filePath: string): Promise<Record<string, unknown>> {
  const content = await readText(filePath);
  return content.startsWith('---') ? parseFrontmatter(content) : {};
}

/**
 * Detect whether a skill body references an MCP server (FR-004). Conservative
 * signal-matching, biased toward over-declaring the mcp capability so verdicts
 * fail safe (per the capability-inference spike).
 */
function detectsMcpReference(content: string): boolean {
  return /mcpServers|mcp__|modelcontextprotocol|\.mcp\.json|\bMCP server\b/i.test(content);
}

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || match[1] === undefined) return {};
  return parseYamlSafe(match[1]);
}

function parseYamlSafe(raw: string): Record<string, unknown> {
  try {
    const data = parseYaml(raw);
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function computeArtifactDigest(
  filePath: string,
  type: ArtifactType,
): Promise<{ hash: string; size: number; members: string[] }> {
  if (type !== 'skill' || basename(filePath).toLowerCase() !== 'skill.md') {
    const content = await fs.readFile(filePath);
    return { hash: createHash('sha256').update(content).digest('hex'), size: content.length, members: [] };
  }

  const root = dirname(filePath);
  const members: string[] = [];
  await collectPackageMembers(root, root, members);
  members.sort();
  const digest = createHash('sha256');
  let size = 0;
  for (const member of members) {
    const content = await fs.readFile(`${root}/${member}`);
    digest.update(member).update('\0').update(content).update('\0');
    size += content.length;
  }
  return { hash: digest.digest('hex'), size, members };
}

async function collectPackageMembers(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  if (dir !== root && entries.some((entry) => entry.name.toLowerCase() === 'skill.md')) return;
  for (const entry of entries) {
    if (DEFAULT_SKIP.includes(entry.name) || entry.name === '.git' || entry.name.startsWith('.')) continue;
    const full = `${dir}/${entry.name}`;
    if (entry.isDirectory()) await collectPackageMembers(root, full, out);
    else if (entry.isFile()) out.push(relative(root, full));
  }
}

function stableArtifactId(filePath: string): string {
  return `art_${createHash('sha256').update(resolve(filePath)).digest('hex').slice(0, 24)}`;
}

function buildArtifact(
  detected: DetectedArtifact,
  hash: string,
  size: number,
  filePath: string,
  organizationalPath: string,
  existing: Artifact | null,
  packageMembers: string[],
): Artifact {
  const now = new Date().toISOString();
  const metadata: Record<string, unknown> = {
    ...detected.metadata,
    ...(packageMembers.length > 0 ? { packageMembers, packageMemberCount: packageMembers.length } : {}),
  };
  const canonicalPath = realpathSync(filePath);
  const pathParts = organizationalPath.split('/');
  if (['first-party', 'third-party', 'harness-defaults'].includes(pathParts[0] ?? '') && pathParts[1]) {
    metadata.sourceId = pathParts[1];
  }
  metadata.canonicalPath = canonicalPath;
  metadata.classification = classifyArtifactMetadata(metadata, organizationalPath, detected.name);
  const artifact: Artifact = {
    id: existing?.id ?? stableArtifactId(filePath),
    type: detected.type,
    name: detected.name,
    path: filePath,
    organizationalPath,
    hash,
    size,
    metadata,
    source: { kind: 'local', path: canonicalPath },
    capabilities: detected.capabilities,
    importedAt: existing?.importedAt ?? now,
    updatedAt: now,
    provenance: `local:${canonicalPath}`,
    ...(packageMembers.length > 0 ? { packageRoot: dirname(filePath), entrypoint: filePath } : {}),
  };
  // Single source of truth for capabilities (FR-004, design/capability-inference.md):
  // derive from type + parsed metadata rather than trusting detection-time guesses.
  artifact.capabilities = inferCapabilities(artifact);
  return artifact;
}

export class ScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScannerError';
  }
}
