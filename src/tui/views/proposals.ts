// ─────────────────────────────────────────────────────────────
// Quartermaster — TUI proposals view (NFR-052)
// Advisory proposals with accept/reject actions (delegates to the
// same deterministic proposal lifecycle the CLI uses).
// ─────────────────────────────────────────────────────────────

import type { EvaluationProposal } from '@core/types';
import { acceptProposal, rejectProposal } from '@core/evaluation/proposals';
import type { Repository } from '@storage/repository';
import { type Theme, defaultTheme, paint } from '../theme';

/** Render the pending/decided proposals list. */
export function renderProposals(proposals: EvaluationProposal[], theme: Theme = defaultTheme): string {
  const lines: string[] = [paint(theme, 'heading', 'Proposals (advisory)')];
  if (proposals.length === 0) {
    lines.push(paint(theme, 'dim', '(no proposals)'));
    return lines.join('\n');
  }
  for (const p of proposals) {
    const color = p.status === 'accepted' ? 'ok' : p.status === 'rejected' ? 'bad' : 'warn';
    lines.push(
      `${paint(theme, color as keyof Theme, `[${p.status}]`)} ${paint(theme, 'accent', p.id)} ` +
        paint(theme, 'dim', `${p.type} — ${p.rationale}`),
    );
  }
  return lines.join('\n');
}

/** Apply an accept/reject action from the TUI (same lifecycle as CLI). */
export function applyProposalAction(
  repo: Repository,
  id: string,
  action: 'accept' | 'reject',
  reason = 'rejected in TUI',
): EvaluationProposal {
  return action === 'accept' ? acceptProposal(repo, id) : rejectProposal(repo, id, reason);
}
