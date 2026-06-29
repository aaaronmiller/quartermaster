// ─────────────────────────────────────────────────────────────
// Quartermaster — TUI loadouts view (NFR-052)
// ─────────────────────────────────────────────────────────────

import type { LoadoutDefinition } from '@core/types';
import { type Theme, defaultTheme, paint } from '../theme';

/** Render the loadout list, marking the active set. */
export function renderLoadouts(loadouts: LoadoutDefinition[], theme: Theme = defaultTheme): string {
  const lines: string[] = [paint(theme, 'heading', 'Loadouts')];
  if (loadouts.length === 0) {
    lines.push(paint(theme, 'dim', '(no loadouts defined)'));
    return lines.join('\n');
  }
  for (const loadout of loadouts) {
    const marker = loadout.active ? paint(theme, 'ok', '●') : paint(theme, 'dim', '○');
    const harnesses = loadout.harnesses.length > 0 ? loadout.harnesses.join(', ') : 'unassigned';
    lines.push(
      `${marker} ${paint(theme, 'accent', loadout.name)} ` +
        paint(theme, 'dim', `— ${loadout.artifacts.length} artifacts, ${loadout.pipelines.length} pipelines [${harnesses}]`),
    );
  }
  return lines.join('\n');
}
