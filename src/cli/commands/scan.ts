// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm scan [roots...] [--incremental]`
// Scans configured (or supplied) roots into the catalog.
// ─────────────────────────────────────────────────────────────

import { rescanIncremental, scanRoots } from '@core/catalog/scanner';
import { loadConfig } from '@core/config/load';
import { auditOnIngest } from '@core/safety/ingest';
import type { Artifact } from '@core/types';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

/** FR-141: audit newly-cataloged artifacts (e.g. self-authored) automatically. */
async function auditNewlyCataloged(repo: Repository, added: Artifact[]): Promise<void> {
  const at = new Date().toISOString();
  for (const artifact of added) {
    await auditOnIngest(repo, artifact, at);
  }
}

export async function scanCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    if (args.flags.incremental === true) {
      const r = await rescanIncremental(repo);
      await auditNewlyCataloged(repo, r.added);
      return success('scan', {
        mode: 'incremental',
        added: r.added.length,
        changed: r.changed.length,
        removed: r.removed.length,
        errors: r.errors,
      });
    }

    const roots = args.positional.length > 0 ? args.positional : cfg.roots;
    if (roots.length === 0) {
      return failure('scan', 'no roots configured — pass a path or set `roots` via `qm config set`');
    }
    const r = await scanRoots(roots, repo);
    await auditNewlyCataloged(repo, r.added);
    return success('scan', {
      mode: 'full',
      roots,
      added: r.added.length,
      changed: r.changed.length,
      removed: r.removed.length,
      errors: r.errors,
    });
  } catch (err) {
    return failure('scan', err instanceof Error ? err.message : String(err));
  } finally {
    repo.close();
  }
}
