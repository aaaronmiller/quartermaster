// ─────────────────────────────────────────────────────────────
// Quartermaster — web compatibility matrix route (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { VerdictResult } from '@core/audit/auditor';
import { layout, esc } from './layout';

const CLASS: Record<string, string> = { deployable: 'ok', transform: 'warn', incompatible: 'bad' };
const GLYPH: Record<string, string> = { deployable: '✓', transform: '~', incompatible: '✗' };

export function renderMatrixPage(matrix: VerdictResult[][], harnesses: string[]): string {
  const head = `<tr><th>Artifact</th>${harnesses.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
  const rows = matrix
    .map((row) => {
      const id = esc(row[0]?.artifactId ?? '');
      const cells = row
        .map((c) => `<td class="${CLASS[c.verdict] ?? ''}" title="${esc(c.reason)}">${GLYPH[c.verdict] ?? '?'}</td>`)
        .join('');
      return `<tr><td>${id}</td>${cells}</tr>`;
    })
    .join('');
  const body = `<div class="card"><table><thead>${head}</thead><tbody>${
    rows || `<tr><td colspan="${harnesses.length + 1}">No artifacts</td></tr>`
  }</tbody></table></div>`;
  return layout('Matrix', body);
}
