// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm status <harness>`
// Reports deployed artifacts, drift, and orphaned target files.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { getHarnessStatus } from '@core/deploy/status';
import { ProfileRegistry } from '@core/profiles/profile-registry';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export async function statusCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const harness = args.positional[0];
  if (!harness) return failure('status', 'usage: qm status <harness>');
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const profile = new ProfileRegistry({ profileDirs: [cfg.profileDir] }).getProfile(harness);
    if (!profile) return failure('status', `profile not found: ${harness}`);
    return success('status', await getHarnessStatus(harness, repo, profile));
  } finally {
    repo.close();
  }
}
