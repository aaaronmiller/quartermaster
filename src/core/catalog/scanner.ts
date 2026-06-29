// ─────────────────────────────────────────────────────────────
// Quartermaster — Catalog Scanner
// Walks library roots, detects artifact types, computes
// hashes, and returns ScanResult for catalog updates.
// ─────────────────────────────────────────────────────────────

import { ARTIFACT_TYPES, type Artifact, type ArtifactType, type ScanResult } from '@core/types';
import type { Repository } from '@storage/repository';
import { createHash } from 'crypto';
import { existsSync, promises as fs, readlinkSync, statSync } from 'fs';
import { basename, dirname, join, relative } from 'path';

export interface ScannerOptions {
  /** Maximum directory depth. Default: 100 */
  maxDepth?: number;
  /** Glob/patterns to skip. */
  skipPatterns?: string[];
}

const DEFAULT_SKIP = [
  '.git',
  'node_modules',
  '.venv',
  '__pycache__',
  'dist',
  'build',
  '.gemini-images',
];

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const VISITED_INODES = new Set<string>();

/**
 * Result of scanning a single file.
 */
interface DetectedArtifact {
  type: ArtifactType;
  name: string;
  path: string;
  metadata: Record<string, unknown>;
  capabilities: Array<{ type: string; dialect: string; metadata?: Record<string, unknown> }>;
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

  const allFiles: string[] = [];

  for (const root of roots) {
    if (!existsSync(root)) {
      throw new ScannerError(`Root does not exist: ${root}`);
    }

    const stat = statSync(root);
    if (stat.isFile()) {
      allFiles.push(root);
    } else {
      await collectFiles(root, 0, maxDepth, skip, allFiles);
    }
  }

  const result: ScanResult = { added: [], changed: [], removed: [], errors: [] };

  for (const filePath of allFiles) {
    try {
      const detected = await detectArtifactType(filePath);
      if (!detected) continue;

      const hash = await computeFileHash(filePath);
      const size = statSync(filePath).size;

      const existingHash = repo.getHashByPath(filePath);
      const isNew = existingHash === null;

      const artifact = buildArtifact(detected, hash, size, filePath);

      if (isNew) {
        result.added.push(artifact);
      } else if (hash !== existingHash) {
        result.changed.push(artifact);
      }
      // unchanged: skip

      repo.upsertArtifact(artifact);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ path: filePath, error: msg });
    }
  }

  return result;
}

export async function rescanIncremental(repo: Repository, _since?: Date): Promise<ScanResult> {
  // Incremental rescan: re-scan all cataloged paths and compare hashes.
  // For production, a `since` filter on updatedAt would be used.
  // For now, re-hash all cataloged files and detect changes.
  const artifacts = repo.listArtifacts();
  const result: ScanResult = { added: [], changed: [], removed: [], errors: [] };

  for (const art of artifacts) {
    try {
      if (!existsSync(art.path)) {
        repo.deleteArtifact(art.id);
        result.removed.push(art);
        continue;
      }

      const newHash = await computeFileHash(art.path);
      if (newHash !== art.hash) {
        const detected = await detectArtifactType(art.path);
        if (detected) {
          const updated = buildArtifact(detected, newHash, statSync(art.path).size, art.path);
          repo.upsertArtifact(updated);
          result.changed.push(updated);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ path: art.path, error: msg });
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
    // permission denied or other error — skip directory
    return;
  }

  for (const entry of entries) {
    if (entry.startsWith('.')) continue; // skip hidden
    if (skip.includes(entry)) continue;

    const fullPath = join(dir, entry);

    let isDir = false;
    let isSymlink = false;
    try {
      const stat = await fs.lstat(fullPath);
      isSymlink = stat.isSymbolicLink();
      if (isSymlink) {
        // Resolve symlink and check for loops via inode
        try {
          const real = await fs.realpath(fullPath);
          const rstat = await fs.stat(real);
          const key = `${rstat.dev}:${rstat.ino}`;
          if (VISITED_INODES.has(key)) {
            // Symlink loop detected — skip
            continue;
          }
          VISITED_INODES.add(key);
          isDir = rstat.isDirectory();
        } catch {
          // broken symlink — skip
          continue;
        }
      } else {
        isDir = stat.isDirectory();
      }
    } catch {
      continue; // can't stat
    }

    if (isDir) {
      await collectFiles(fullPath, depth + 1, maxDepth, skip, out);
    } else {
      out.push(fullPath);
    }
  }
}

// ─── Artifact Type Detection ───────────────────────────────

async function detectArtifactType(filePath: string): Promise<DetectedArtifact | null> {
  const fileName = basename(filePath);
  const parentDir = basename(dirname(filePath));

  // 1. Hook pattern: hook-*
  if (fileName.startsWith('hook-') && !fileName.endsWith('.md')) {
    const firstLines = await readFirstLines(filePath, 10);
    const purpose = firstLines.find((l) => l.startsWith('#') || l.startsWith('//'));
    return {
      type: 'hook',
      name: fileName,
      path: filePath,
      metadata: { purpose: purpose?.replace(/^[#/]+\s*/, '') ?? '' },
      capabilities: [{ type: 'hooks', dialect: 'claude' }],
    };
  }

  // 2. Agent: manifest.yaml in parent
  if (fileName === 'manifest.yaml' || fileName === 'manifest.yml') {
    return {
      type: 'agent',
      name: parentDir,
      path: filePath,
      metadata: {},
      capabilities: [{ type: 'agent-config', dialect: 'generic' }],
    };
  }

  // 3. Plugin: package.json with "type" field
  if (fileName === 'package.json') {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const pkg = JSON.parse(content);
      if (pkg.type) {
        const components = (pkg.components as Array<{ type: string }>) ?? [];
        const caps = components.map((c) => ({
          type: c.type || 'unknown',
          dialect: 'plugin',
        }));
        if (components.some((c) => c.type === 'hook')) {
          caps.push({ type: 'hooks', dialect: 'plugin' });
        }
        return {
          type: 'plugin',
          name: pkg.name || parentDir,
          path: filePath,
          metadata: { components, version: pkg.version },
          capabilities: caps.length > 0 ? caps : [{ type: 'plugin', dialect: 'generic' }],
        };
      }
    } catch {
      // not parseable JSON or not a plugin
    }
  }

  // 4. MCP config
  if (fileName === '.mcp.json' || fileName === 'mcp-servers.json') {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const config = JSON.parse(content);
      const type = Array.isArray(config) ? 'multi' : 'single';
      return {
        type: 'mcp-config',
        name: fileName,
        path: filePath,
        metadata: { mcpType: type },
        capabilities: [
          { type: 'mcp', dialect: type === 'multi' ? 'multi-server' : 'single-server' },
        ],
      };
    } catch {
      return {
        type: 'mcp-config',
        name: fileName,
        path: filePath,
        metadata: {},
        capabilities: [{ type: 'mcp', dialect: 'generic' }],
      };
    }
  }

  // 5. Skill: .md with YAML frontmatter
  if (fileName.endsWith('.md')) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      if (content.startsWith('---')) {
        const fm = extractFrontmatter(content);
        const tags = (fm.tags as string[]) ?? [];
        return {
          type: 'skill',
          name: (fm.name as string) ?? fileName.replace(/\.md$/, ''),
          path: filePath,
          metadata: {
            description: fm.description ?? '',
            tags,
            grade: fm.grade ?? null,
            source: fm.source ?? null,
          },
          capabilities: [{ type: 'skill', dialect: 'agent-md' }],
        };
      }
    } catch {
      // not a skill
    }
  }

  // 6. Script: .py
  if (fileName.endsWith('.py')) {
    return {
      type: 'script',
      name: fileName,
      path: filePath,
      metadata: {},
      capabilities: [{ type: 'scripts', dialect: 'python' }],
    };
  }

  // 7. Agent config: .agent/**/*.md or .agent/**/*.json
  if (filePath.includes('.agent')) {
    return {
      type: 'slash-command',
      name: fileName,
      path: filePath,
      metadata: {},
      capabilities: [{ type: 'commands', dialect: 'agent' }],
    };
  }

  // 8. Unrecognized - skip
  return null;
}

// ─── Helpers ───────────────────────────────────────────────

async function computeFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function readFirstLines(filePath: string, n: number): Promise<string[]> {
  const content = await fs.readFile(filePath, 'utf-8');
  return content.split('\n').slice(0, n);
}

function extractFrontmatter(content: string): Record<string, unknown> {
  const endIdx = content.indexOf('---', 3);
  if (endIdx === -1) return {};
  const raw = content.slice(3, endIdx).trim();
  const result: Record<string, unknown> = {};
  for (const line of raw.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    result[key] = value;
  }
  return result;
}

function buildArtifact(
  detected: DetectedArtifact,
  hash: string,
  size: number,
  filePath: string,
): Artifact {
  return {
    id: hash.slice(0, 16),
    type: detected.type,
    name: detected.name,
    path: filePath,
    hash,
    size,
    metadata: detected.metadata,
    source: { kind: 'local', path: filePath },
    capabilities: detected.capabilities,
    importedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    provenance: `local:${filePath}`,
  };
}

export class ScannerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScannerError';
  }
}
