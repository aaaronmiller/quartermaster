// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm deploy <harness>`
// Preview deployment plans. Apply/rollback are wired in later tasks.
// ─────────────────────────────────────────────────────────────

import { computeCompatibilityMatrix, loadVerdictOverrides } from '@core/audit/auditor';
import { loadConfig } from '@core/config/load';
import { compilePlan, type PlanScope } from '@core/deploy/plan';
import { executePlacement } from '@core/deploy/placer';
import { createRecord, storeRecord } from '@core/deploy/records';
import { rollbackDeployment } from '@core/deploy/rollback';
import { LoadoutManager } from '@core/loadouts/loadouts';
import { ProfileRegistry } from '@core/profiles/profile-registry';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export async function deployCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const registry = new ProfileRegistry({ profileDirs: [cfg.profileDir] });
    const targets = resolveTargets(args, cfg, registry);
    if (!targets.ok) return failure('deploy', targets.reason);
    const artifacts = repo.listArtifacts();
    const loadouts = new LoadoutManager(repo);
    const overrides = loadVerdictOverrides(repo);
    const profiles = targets.ids.map((id) => registry.getProfile(id)).filter((p) => p !== null);
    const scope = parseScope(args.flags.scope);
    const plans = profiles.map((profile) => {
      const scopedArtifacts = loadouts.filterArtifactsForHarness(artifacts, profile.id);
      const matrix = computeCompatibilityMatrix(scopedArtifacts, [profile], overrides);
      const verdicts = matrix.map((row) => row[0]!).filter(Boolean);
      return compilePlan(scopedArtifacts, verdicts, profile, scope ? { scope } : undefined);
    });
    if (args.flags.yes === true) {
      const deployments = [];
      for (const plan of plans) {
        const result = await executePlacement(plan, repo);
        const record = createRecord(
          plan,
          result.operations.some((op) => op.status === 'failed') ? 'failed' : 'applied',
        );
        storeRecord(record, repo);
        deployments.push({ plan, record, result });
      }
      return success('deploy', {
        mode: 'applied',
        ...(deployments.length === 1 ? deployments[0] : { deployments }),
      });
    }
    return success('deploy', {
      mode: 'dry-run',
      requiresConfirmation: true,
      ...(plans.length === 1 ? { plan: plans[0] } : { plans }),
    });
  } finally {
    repo.close();
  }
}

function parseScope(raw: boolean | string | undefined): PlanScope | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  if (raw.startsWith('path:')) return { orgPath: raw.slice('path:'.length) };
  if (raw.startsWith('tag:')) return { tags: [raw.slice('tag:'.length)] };
  if (raw.startsWith('id:')) return { ids: [raw.slice('id:'.length)] };
  return { ids: [raw] };
}

function resolveTargets(
  args: ParsedArgs,
  cfg: ReturnType<typeof loadConfig>,
  registry: ProfileRegistry,
): { ok: true; ids: string[] } | { ok: false; reason: string } {
  if (args.flags.all === true) {
    const ids = cfg.harnesses.length > 0 ? cfg.harnesses : registry.listProfiles().map((profile) => profile.id);
    return { ok: true, ids };
  }
  const target = args.positional[0];
  if (!target) return { ok: false, reason: 'usage: qm deploy <harness|group> or qm deploy --all' };
  const group = cfg.harnessGroups[target];
  if (group) return { ok: true, ids: group };
  if (registry.getProfile(target)) return { ok: true, ids: [target] };
  return { ok: false, reason: `profile or group not found: ${target}` };
}

export async function rollbackCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const recordId = args.positional[0];
  if (!recordId) return failure('rollback', 'usage: qm rollback <deployId>');
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const record = await rollbackDeployment(recordId, repo);
    return success('rollback', { record });
  } finally {
    repo.close();
  }
}
