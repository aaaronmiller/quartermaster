// ─────────────────────────────────────────────────────────────
// Quartermaster — web proposals route (NFR-052)
// Advisory proposals with accept/reject POST actions.
// ─────────────────────────────────────────────────────────────

import type { EvaluationProposal } from '@core/types';
import { layout, esc } from './layout';

const STATUS_META: Record<string, { cls: string }> = {
  accepted: { cls: 'ok' },
  rejected: { cls: 'bad' },
  pending: { cls: 'warn' },
};

export function renderProposalsPage(proposals: EvaluationProposal[], path: string = '/'): string {
  const rows = proposals
    .map((p) => {
      const meta = STATUS_META[p.status] ?? { cls: '' };
      const statusCell =
        `<span class="cell-status ${meta.cls} status-badge">${esc(p.status)}</span>`;
      const actionCell =
        p.status === 'pending'
          ? `<form method="post" action="/proposals/${esc(p.id)}/accept" style="display:inline" class="action-form">
               <button type="submit" class="sm">Accept</button>
             </form>
             <form method="post" action="/proposals/${esc(p.id)}/reject" style="display:inline" class="action-form">
               <button type="submit" class="sm reject">Reject</button>
             </form>`
          : '<span style="color:var(--fg-muted);font-size:12px">resolved</span>';

      return `<tr class="data-row">
        <td>${statusCell}</td>
        <td><code>${esc(p.id)}</code></td>
        <td><span class="chip">${esc(p.type)}</span></td>
        <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(p.rationale)}</td>
        <td class="actions-cell">${actionCell}</td>
      </tr>`;
    })
    .join('');

  const empty =
    rows ||
    `<tr><td colspan="5" class="empty-state"><strong>No proposals</strong> -- run <code>qm eval grade</code> or <code>qm propose loadouts</code></td></tr>`;

  const summary = `
    <div class="stat-row anim-section">
      <div class="stat-pill"><div class="stat-val">${proposals.length}</div><div class="stat-label">Total</div></div>
      <div class="stat-pill"><div class="stat-val">${proposals.filter((p) => p.status === 'pending').length}</div><div class="stat-label">Pending</div></div>
      <div class="stat-pill"><div class="stat-val">${proposals.filter((p) => p.status === 'accepted').length}</div><div class="stat-label">Accepted</div></div>
    </div>`;

  const body = `
    ${summary}
    <div class="glass-card accent-bar anim-section table-wrap">
      <table>
        <thead><tr><th>Status</th><th>ID</th><th>Type</th><th>Rationale</th><th>Action</th></tr></thead>
        <tbody>${empty}</tbody>
      </table>
    </div>`;
  return layout('Proposals', body, path);
}
