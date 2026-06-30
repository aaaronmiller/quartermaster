// ─────────────────────────────────────────────────────────────
// Quartermaster — web loadouts route (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { LoadoutDefinition } from '@core/types';
import { layout, esc } from './layout';

export function renderLoadoutsPage(loadouts: LoadoutDefinition[], path: string = '/'): string {
  const rows = loadouts
    .map(
      (l) => {
        const activeCell = l.active
          ? '<span class="cell-status ok status-badge"><span class="glyph ok">●</span> Active</span>'
          : '<span class="cell-status" style="color:var(--fg-dim)"><span class="glyph" style="background:rgba(255,255,255,0.06);color:var(--fg-dim)">○</span> Inactive</span>';
        return `<tr class="data-row">
          <td>${activeCell}</td>
          <td><strong>${esc(l.name)}</strong></td>
          <td>${l.artifacts.length}</td>
          <td>${l.pipelines.length}</td>
          <td>${l.harnesses.length ? l.harnesses.map((h) => `<span class="chip">${esc(h)}</span>`).join(' ') : '<span style="color:var(--fg-muted)">unassigned</span>'}</td>
        </tr>`;
      },
    )
    .join('');

  const empty =
    rows ||
    `<tr><td colspan="5" class="empty-state"><strong>No loadouts</strong> -- run <code>qm loadout create</code></td></tr>`;

  const summary = `
    <div class="stat-row anim-section">
      <div class="stat-pill"><div class="stat-val">${loadouts.length}</div><div class="stat-label">Total</div></div>
      <div class="stat-pill"><div class="stat-val">${loadouts.filter((l) => l.active).length}</div><div class="stat-label">Active</div></div>
      <div class="stat-pill"><div class="stat-val">${loadouts.reduce((s, l) => s + l.artifacts.length, 0)}</div><div class="stat-label">Artifacts</div></div>
    </div>`;

  const body = `
    ${summary}
    <div class="glass-card accent-bar anim-section" style="padding:0; overflow:hidden;">
      <table>
        <thead><tr><th></th><th>Loadout</th><th>Artifacts</th><th>Pipelines</th><th>Harnesses</th></tr></thead>
        <tbody>${empty}</tbody>
      </table>
    </div>`;
  return layout('Loadouts', body, path);
}
