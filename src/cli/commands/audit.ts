// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm audit`
// Compatibility matrix and manual verdict overrides.
// ─────────────────────────────────────────────────────────────

import {
  computeCompatibilityMatrix,
  loadVerdictOverrides,
  saveVerdictOverride,
  summarizeMatrix,
  type VerdictStatus,
} from '@core/audit/auditor';
import { loadConfig } from '@core/config/load';
import { ProfileRegistry } from '@core/profiles/profile-registry';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function auditCommand(args: ParsedArgs): OutputEnvelope {
  if (args.positional[0] === 'override') return overrideCommand(args);

  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const profiles = new ProfileRegistry({ profileDirs: [cfg.profileDir] }).listProfiles();
    const artifacts = repo.listArtifacts();
    const matrix = computeCompatibilityMatrix(artifacts, profiles, loadVerdictOverrides(repo));
    return success('audit', {
      artifacts: artifacts.length,
      harnesses: profiles.map((profile) => profile.id),
      summary: summarizeMatrix(matrix),
      matrix: matrix.map((row) =>
        row.map((cell) => ({
          artifactId: cell.artifactId,
          harness: cell.harness,
          verdict: cell.verdict,
          reason: cell.reason,
          transformation: cell.transformation,
        })),
      ),
    });
  } finally {
    repo.close();
  }
}

function overrideCommand(args: ParsedArgs): OutputEnvelope {
  const artifactId = args.positional[1];
  const harness = args.positional[2];
  const status = args.flags.status;
  const note = args.flags.note;
  if (!artifactId || !harness || typeof status !== 'string' || typeof note !== 'string') {
    return failure(
      'audit',
      'usage: qm audit override <artifact> <harness> --status=<deployable|transform|incompatible> --note=<text>',
    );
  }
  if (!['deployable', 'transform', 'incompatible'].includes(status)) {
    return failure('audit', `invalid override status: ${status}`);
  }

  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    saveVerdictOverride(repo, {
      artifactId,
      harness,
      status: status as VerdictStatus,
      note,
    });
    return success('audit', { artifactId, harness, status, note });
  } finally {
    repo.close();
  }
}
