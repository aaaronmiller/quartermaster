// ─────────────────────────────────────────────────────────────
// Quartermaster — proposal lifecycle and proposal generation.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { proposeLoadouts } from '@core/evaluation/propose-loadouts';
import { acceptProposal, editProposal, rejectProposal } from '@core/evaluation/proposals';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function proposalCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, id, value] = args.positional;
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    switch (sub) {
      case 'list':
      case undefined:
        return success('proposal', { proposals: repo.listProposals() });
      case 'accept':
        if (!id) return failure('proposal', 'usage: qm proposal accept <id>');
        return success('proposal', { proposal: acceptProposal(repo, id) });
      case 'reject':
        if (!id) return failure('proposal', 'usage: qm proposal reject <id> [reason]');
        return success('proposal', { proposal: rejectProposal(repo, id, value ?? 'rejected by user') });
      case 'edit':
        if (!id || value === undefined) return failure('proposal', 'usage: qm proposal edit <id> <json>');
        return success('proposal', { proposal: editProposal(repo, id, JSON.parse(value)) });
      default:
        return failure('proposal', `unknown subcommand '${sub}'`);
    }
  } catch (err) {
    return failure('proposal', (err as Error).message);
  } finally {
    repo.close();
  }
}

export function proposeCommand(args: ParsedArgs): OutputEnvelope {
  const [sub] = args.positional;
  if (sub !== 'loadouts') return failure('propose', 'usage: qm propose loadouts');
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    return success('propose', { proposal: proposeLoadouts(repo, repo.listArtifacts()) });
  } finally {
    repo.close();
  }
}
