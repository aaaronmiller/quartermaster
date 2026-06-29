// ─────────────────────────────────────────────────────────────
// Quartermaster — web proposals route (NFR-052)
// Advisory proposals with accept/reject POST actions.
// ─────────────────────────────────────────────────────────────

import type { EvaluationProposal } from '@core/types';
import { layout, esc } from './layout';

const CLASS: Record<string, string> = { accepted: 'ok', rejected: 'bad', pending: 'warn' };

export function renderProposalsPage(proposals: EvaluationProposal[]): string {
  const rows = proposals
    .map(
      (p) =>
        `<tr><td class="${CLASS[p.status] ?? ''}">${esc(p.status)}</td><td>${esc(p.id)}</td><td>${esc(p.type)}</td>` +
        `<td>${esc(p.rationale)}</td><td>` +
        (p.status === 'pending'
          ? `<form method="post" action="/proposals/${esc(p.id)}/accept" style="display:inline"><button>Accept</button></form> ` +
            `<form method="post" action="/proposals/${esc(p.id)}/reject" style="display:inline"><button class="reject">Reject</button></form>`
          : '') +
        `</td></tr>`,
    )
    .join('');
  const body = `<div class="card"><table>
    <thead><tr><th>Status</th><th>ID</th><th>Type</th><th>Rationale</th><th>Action</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No proposals</td></tr>'}</tbody></table></div>`;
  return layout('Proposals', body);
}
