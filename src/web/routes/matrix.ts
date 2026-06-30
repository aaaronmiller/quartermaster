// ─────────────────────────────────────────────────────────────
// Quartermaster — web compatibility matrix route (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { VerdictResult } from '@core/audit/auditor';
import { layout, esc } from './layout';

const VERDICT_META: Record<string, { cls: string; label: string }> = {
  deployable: { cls: 'ok', label: 'deployable' },
  transform: { cls: 'warn', label: 'transform' },
  incompatible: { cls: 'bad', label: 'incompatible' },
};

export function renderMatrixPage(matrix: VerdictResult[][], harnesses: string[], path: string = '/'): string {
  const head = `<tr><th>Artifact</th>${harnesses.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;

  const rows = matrix
    .map((row) => {
      const id = esc(row[0]?.artifactId ?? '');
      const cells = row
        .map((c) => {
          const meta = VERDICT_META[c.verdict] ?? { cls: '', label: c.verdict };
          const labelText = meta.label ?? c.verdict ?? '?';
          const reason = esc(c.reason || '');
          return `<td class="cell-status ${esc(meta.cls)} status-badge" title="${reason}"><span class="glyph ${esc(meta.cls)}">${labelText[0]?.toUpperCase() ?? '?'}</span> ${esc(labelText)}</td>`;
        })
        .join('');
      return `<tr class="data-row"><td><code>${id}</code></td>${cells}</tr>`;
    })
    .join('');

  const empty =
    rows ||
    `<tr><td colspan="${harnesses.length + 1}" class="empty-state"><strong>No artifacts</strong></td></tr>`;

  const summaryPills = `
    <div class="stat-row anim-section">
      <div class="stat-pill"><div class="stat-val">${matrix.length}</div><div class="stat-label">Artifacts</div></div>
      <div class="stat-pill"><div class="stat-val">${harnesses.length}</div><div class="stat-label">Harnesses</div></div>
      <div class="stat-pill"><div class="stat-val">${harnesses.length * matrix.length}</div><div class="stat-label">Verdicts</div></div>
    </div>`;

  const body = `
    ${summaryPills}
    <div class="glass-card accent-bar anim-section" style="padding:0; overflow:auto;">
      <table>
        <thead>${head}</thead>
        <tbody>${empty}</tbody>
      </table>
    </div>`;
  return layout('Matrix', body, path);
}
