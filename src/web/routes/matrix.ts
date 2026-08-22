// ─────────────────────────────────────────────────────────────
// Quartermaster — web compatibility matrix route (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { VerdictResult } from '@core/audit/auditor';
import { layout, esc } from './layout';
import { DEFAULT_LIMIT, type ViewScope } from './scope';

const VERDICT_META: Record<string, { cls: string; label: string }> = {
  deployable: { cls: 'ok', label: 'deployable' },
  transform: { cls: 'warn', label: 'transform' },
  incompatible: { cls: 'bad', label: 'incompatible' },
};

export function renderMatrixPage(
  matrix: VerdictResult[][],
  harnesses: string[],
  path: string = '/',
  scope?: ViewScope,
): string {
  // 12,137 artifacts x 13 harnesses is 157,781 cells and 23 MB of HTML. The
  // matrix is only readable a page at a time.
  const limit = scope?.limit ?? DEFAULT_LIMIT;
  const offset = scope?.offset ?? 0;
  const page = matrix.slice(offset, offset + limit);
  const shownFrom = matrix.length === 0 ? 0 : offset + 1;
  const shownTo = Math.min(offset + limit, matrix.length);

  const qs = (o: number) => {
    const p = new URLSearchParams();
    if (scope?.type) p.set('type', scope.type);
    p.set('limit', String(limit));
    if (o > 0) p.set('offset', String(o));
    return `${path}?${p.toString()}`;
  };
  const pager = `
    <div class="glass-card anim-section" style="display:flex;gap:12px;align-items:center">
      <span class="chip">showing ${shownFrom}-${shownTo} of ${matrix.length}</span>
      ${offset > 0 ? `<a class="chip" href="${esc(qs(Math.max(0, offset - limit)))}">&larr; prev</a>` : '<span class="chip" aria-disabled="true">&larr; prev</span>'}
      ${shownTo < matrix.length ? `<a class="chip" href="${esc(qs(offset + limit))}">next &rarr;</a>` : '<span class="chip" aria-disabled="true">next &rarr;</span>'}
    </div>`;

  const head = `<tr><th>Artifact</th>${harnesses.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;

  const rows = page
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
    ${pager}
    <div class="glass-card accent-bar anim-section table-wrap">
      <table>
        <thead>${head}</thead>
        <tbody>${empty}</tbody>
      </table>
    </div>`;
  return layout('Matrix', body, path);
}
