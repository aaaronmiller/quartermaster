// ─────────────────────────────────────────────────────────────
// Quartermaster — web loadouts route (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { LoadoutDefinition } from '@core/types';
import { layout, esc } from './layout';

export function renderLoadoutsPage(loadouts: LoadoutDefinition[]): string {
  const rows = loadouts
    .map(
      (l) =>
        `<tr><td>${l.active ? '<span class="ok">●</span>' : '<span>○</span>'}</td><td>${esc(l.name)}</td>` +
        `<td>${l.artifacts.length}</td><td>${l.pipelines.length}</td><td>${esc(l.harnesses.join(', ') || 'unassigned')}</td></tr>`,
    )
    .join('');
  const body = `<div class="card"><table>
    <thead><tr><th></th><th>Loadout</th><th>Artifacts</th><th>Pipelines</th><th>Harnesses</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">No loadouts</td></tr>'}</tbody></table></div>`;
  return layout('Loadouts', body);
}
