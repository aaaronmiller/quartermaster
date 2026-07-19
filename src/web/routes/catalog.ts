// ─────────────────────────────────────────────────────────────
// Quartermaster — web catalog route (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { Artifact } from '@core/types';
import { artifactClassification } from '@core/classification/classify';
import { layout, esc } from './layout';

export function renderCatalogPage(artifacts: Artifact[], path: string = '/'): string {
  const chip = (text: string, cls = '') =>
    cls ? `<span class="chip ${esc(cls)}">${esc(text)}</span>` : `<span class="chip">${esc(text)}</span>`;

  const rows = artifacts
    .map((a) => {
      const classification = artifactClassification(a);
      return `<tr class="data-row">
          <td>${chip(a.type)}</td>
          <td><strong>${esc(a.name)}</strong></td>
          <td><code style="font-size:12px">${esc(a.organizationalPath)}</code></td>
          <td>${a.capabilities.map((c) => chip(c.type, c.type)).join(' ')}</td>
          <td>${chip(classification.sourceClass)} ${chip(classification.lifecycle)}</td>
          <td>${classification.functions.map((item) => chip(item)).join(' ')}</td>
        </tr>`;
    })
    .join('');

  const empty =
    rows ||
    `<tr><td colspan="6" class="empty-state"><strong>No artifacts</strong> -- run <code>qm scan</code></td></tr>`;

  const countPills = `
    <div class="stat-row anim-section">
      <div class="stat-pill"><div class="stat-val">${artifacts.length}</div><div class="stat-label">Total</div></div>
      <div class="stat-pill"><div class="stat-val">${new Set(artifacts.map((a) => a.type)).size}</div><div class="stat-label">Types</div></div>
      <div class="stat-pill"><div class="stat-val">${artifacts.filter((a) => a.source && a.source.kind === 'self').length}</div><div class="stat-label">Self-authored</div></div>
    </div>`;

  const body = `
    ${countPills}
    <div class="glass-card accent-bar anim-section table-wrap">
      <table>
        <thead><tr><th>Type</th><th>Name</th><th>Path</th><th>Capabilities</th><th>Source / lifecycle</th><th>Functions</th></tr></thead>
        <tbody>${empty}</tbody>
      </table>
    </div>`;
  return layout('Catalog', body, path);
}
