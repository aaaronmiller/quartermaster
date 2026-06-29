// ─────────────────────────────────────────────────────────────
// Quartermaster — TUI compatibility matrix view (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { VerdictResult } from '@core/audit/auditor';
import { type Theme, defaultTheme, paint } from '../theme';

const VERDICT_GLYPH: Record<string, string> = {
  deployable: '✓',
  transform: '~',
  incompatible: '✗',
};

/** Render an artifact × harness compatibility grid as text. */
export function renderMatrix(
  matrix: VerdictResult[][],
  harnesses: string[],
  theme: Theme = defaultTheme,
): string {
  const lines: string[] = [];
  lines.push(paint(theme, 'heading', 'Compatibility Matrix'));
  lines.push(paint(theme, 'dim', `artifact${' '.repeat(16)}${harnesses.join('  ')}`));

  for (const row of matrix) {
    const id = (row[0]?.artifactId ?? '').slice(0, 22).padEnd(24);
    const cells = row.map((cell) => {
      const glyph = VERDICT_GLYPH[cell.verdict] ?? '?';
      const color = cell.verdict === 'deployable' ? 'ok' : cell.verdict === 'transform' ? 'warn' : 'bad';
      return paint(theme, color as keyof Theme, glyph);
    });
    lines.push(`${id}${cells.join('   ')}`);
  }

  if (matrix.length === 0) lines.push(paint(theme, 'dim', '(no artifacts)'));
  return lines.join('\n');
}
