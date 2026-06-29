// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm import <source>`
// Imports artifacts from git, git subdirs, marketplaces, and local paths.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import type { ArtifactSource } from '@core/types';
import { ImportManager } from '@core/sources/importers';
import { Repository } from '@storage/repository';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

type ImportKind = ArtifactSource['kind'];

export async function importCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const raw = args.positional[0];
  if (!raw) return failure('import', 'missing source. Usage: qm import <source> [--kind=...]');

  const cfg = loadConfig();
  const targetDir = typeof args.flags.target === 'string' ? args.flags.target : cfg.roots[0];
  if (!targetDir) return failure('import', 'no import target configured; pass --target=<path>');

  const source = detectSource(raw, args);
  if (!source.ok) return failure('import', source.reason);

  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const manager = new ImportManager(repo);
    const pin = typeof args.flags.pin === 'string' ? args.flags.pin : undefined;
    const options = {
      source: source.source,
      targetDir,
      ...(pin ? { pin } : {}),
    };
    const result = await manager.importFromSource(options);
    return success('import', {
      source: source.source,
      targetDir,
      added: result.added.length,
      changed: result.changed.length,
      removed: result.removed.length,
      errors: result.errors,
    });
  } finally {
    repo.close();
  }
}

function detectSource(
  raw: string,
  args: ParsedArgs,
): { ok: true; source: ArtifactSource } | { ok: false; reason: string } {
  const kind = typeof args.flags.kind === 'string' ? (args.flags.kind as ImportKind) : undefined;
  const ref = typeof args.flags.ref === 'string' ? args.flags.ref : 'HEAD';
  const subdir = typeof args.flags.subdir === 'string' ? args.flags.subdir : undefined;

  if (kind) return sourceForKind(kind, raw, ref, subdir);
  if (raw.startsWith('file://')) return { ok: true, source: { kind: 'marketplace', url: raw } };

  const github = parseGithub(raw);
  if (github) return { ok: true, source: { kind: 'github', ...github, ref } };

  if (isLocalGitRepo(raw)) return { ok: true, source: { kind: 'git', url: raw, ref } };
  if (existsSync(raw)) return { ok: true, source: { kind: 'local', path: raw } };
  if (/\.git($|#)/.test(raw) || raw.startsWith('git@') || raw.startsWith('ssh://')) {
    return { ok: true, source: { kind: 'git', url: raw, ref } };
  }
  return { ok: true, source: { kind: 'marketplace', url: raw } };
}

function sourceForKind(
  kind: ImportKind,
  raw: string,
  ref: string,
  subdir: string | undefined,
): { ok: true; source: ArtifactSource } | { ok: false; reason: string } {
  switch (kind) {
    case 'github': {
      const github = parseGithub(raw);
      if (!github) return { ok: false, reason: 'github source must look like github.com/owner/repo' };
      return { ok: true, source: { kind: 'github', ...github, ref, ...(subdir ? { subdir } : {}) } };
    }
    case 'git':
      return { ok: true, source: { kind: 'git', url: raw, ref } };
    case 'git_subdir':
      if (!subdir) return { ok: false, reason: 'git_subdir import requires --subdir=<path>' };
      return { ok: true, source: { kind: 'git_subdir', url: raw, ref, subdir } };
    case 'marketplace':
      return { ok: true, source: { kind: 'marketplace', url: raw } };
    case 'local':
      return { ok: true, source: { kind: 'local', path: raw } };
    case 'self':
      return { ok: false, reason: 'self-authored artifacts are created in the library, not imported' };
  }
}

function parseGithub(raw: string): { owner: string; repo: string } | null {
  const match = raw.match(/github\.com[:/](?<owner>[^/\s]+)\/(?<repo>[^/\s#]+?)(?:\.git)?(?:[#/].*)?$/);
  if (!match?.groups) return null;
  const owner = match.groups.owner;
  const repo = match.groups.repo;
  if (!owner || !repo) return null;
  return { owner, repo };
}

function isLocalGitRepo(path: string): boolean {
  return existsSync(join(path, '.git'));
}
