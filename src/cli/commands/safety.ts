// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm safety` CLI command
// FR-140, FR-141, FR-142: safety auditor orchestration with
// persisted findings, trusted allowlist, and recorded overrides.
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '@core/config/load';
import { runAuditors, type AuditorConfig } from '@core/safety/auditors';
import { computeSafetyScore } from '@core/safety/findings';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export async function safetyCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const [sub] = args.positional;
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });

  try {
    switch (sub) {
      case 'allowlist':
      case 'allow':
        return allowlistHandler(args, repo);
      case 'threshold':
        return thresholdHandler(args, cfg.safety?.threshold ?? 0.6);
      case 'override':
        return overrideHandler(args, repo);
      case 'audit':
        return await auditHandler(args, repo, cfg.safety?.threshold ?? 0.6);
      default:
        return failure('safety', 'usage: qm safety allowlist|threshold|override|audit');
    }
  } catch (err) {
    return failure('safety', (err as Error).message);
  } finally {
    repo.close();
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function allowlistHandler(args: ParsedArgs, repo: Repository): OutputEnvelope {
  const [, action, value] = args.positional;
  if (action === 'add') {
    if (!value) return failure('safety', 'usage: qm safety allowlist add <source-or-artifact-id> [--kind=source|artifact|plugin]');
    const kind = typeof args.flags.kind === 'string' ? args.flags.kind : 'source';
    const reason = typeof args.flags.reason === 'string' ? args.flags.reason : 'trusted by developer';
    repo.addAllowlistEntry(kind, value, reason, nowIso());
    return success('safety', { allowlist: repo.listAllowlist() });
  }
  if (action === 'remove') {
    if (!value) return failure('safety', 'usage: qm safety allowlist remove <value>');
    repo.removeAllowlistEntry(value);
    return success('safety', { allowlist: repo.listAllowlist() });
  }
  // list (default)
  return success('safety', { allowlist: repo.listAllowlist() });
}

function thresholdHandler(args: ParsedArgs, current: number): OutputEnvelope {
  const [, value] = args.positional;
  if (value === undefined) return success('safety', { threshold: current });
  const threshold = Number.parseFloat(value);
  if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
    return failure('safety', 'threshold must be a number between 0 and 1');
  }
  // Persist to the project config file.
  const projectPath = `${process.cwd()}/quartermaster.json`;
  const config = existsSync(projectPath) ? JSON.parse(readFileSync(projectPath, 'utf8')) : {};
  config.safety = { ...(config.safety ?? {}), threshold };
  writeFileSync(projectPath, `${JSON.stringify(config, null, 2)}\n`);
  return success('safety', { threshold, file: projectPath });
}

function overrideHandler(args: ParsedArgs, repo: Repository): OutputEnvelope {
  const [, artifactId] = args.positional;
  if (!artifactId) return failure('safety', 'usage: qm safety override <artifact> --note=<reason>');
  const note = typeof args.flags.note === 'string' ? args.flags.note : '';
  if (!note) return failure('safety', 'override requires a --note explaining why the block is overridden');
  repo.saveSafetyOverride(artifactId, note, nowIso());
  return success('safety', { override: { artifactId, note } });
}

async function auditHandler(args: ParsedArgs, repo: Repository, threshold: number): Promise<OutputEnvelope> {
  const [, artifactId] = args.positional;
  if (!artifactId) return failure('safety', 'usage: qm safety audit <artifact>');
  const artifact = repo.getArtifact(artifactId);
  if (!artifact) return failure('safety', `artifact not found: ${artifactId}`);

  // FR-142: allowlisted sources/artifacts skip routine auditing.
  const allowlisted = new Set(repo.listAllowlist().map((e) => e.value));
  if (allowlisted.has(artifact.source.kind) || allowlisted.has(artifact.id)) {
    return success('safety', { status: 'skipped', reason: 'allowlisted', artifactId });
  }

  // Default auditor set; richer configs would come from cfg.safety in future.
  const auditorConfigs: AuditorConfig[] = [{ name: 'risk-scanner', command: 'true', enabled: true }];
  const report = await runAuditors(artifact, auditorConfigs);

  // FR-140: normalize findings into the catalog.
  const findings = report.auditors.flatMap((a) => a.findings);
  repo.saveFindings(artifactId, findings, nowIso());
  const score = computeSafetyScore(findings);

  return success('safety', {
    report,
    score,
    threshold,
    gated: score < threshold && !repo.getSafetyOverride(artifactId),
  });
}
