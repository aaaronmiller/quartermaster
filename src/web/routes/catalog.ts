// ─────────────────────────────────────────────────────────────
// Quartermaster — web catalog route (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { Artifact } from '@core/types';
import { layout, esc } from './layout';

export function renderCatalogPage(artifacts: Artifact[]): string {
  const rows = artifacts
    .map(
      (a) =>
        `<tr><td>${esc(a.type)}</td><td>${esc(a.name)}</td><td>${esc(a.organizationalPath)}</td><td>${esc(
          a.capabilities.map((c) => c.type).join(', '),
        )}</td></tr>`,
    )
    .join('');
  const body = `
    <div class="card">
      <table>
        <thead><tr><th>Type</th><th>Name</th><th>Path</th><th>Capabilities</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No artifacts — run <code>qm scan</code></td></tr>'}</tbody>
      </table>
    </div>`;
  return layout('Catalog', body);
}
