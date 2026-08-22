// ─────────────────────────────────────────────────────────────
// Quartermaster — TUI shell (NFR-052, dark-mode-first)
// A thin terminal surface over the deterministic engine. Views are
// pure string renderers (testable without a TTY); `runTui` wires them
// to a repository and prints a dashboard.
// ─────────────────────────────────────────────────────────────

import { computeCompatibilityMatrix } from '@core/audit/auditor';
import { loadConfig } from '@core/config/load';
import { ProfileRegistry } from '@core/profiles/profile-registry';
import type { Artifact } from '@core/types';
import { Repository } from '@storage/repository';
import { type Theme, defaultTheme, paint } from './theme';
import { renderMatrix } from './views/matrix';
import { renderLoadouts } from './views/loadouts';
import { renderProposals } from './views/proposals';

// The dashboard is a fixed-height frame, so whatever sorts first is the only
// thing anyone sees. Unordered, the catalogue led with `+layout.js`,
// `+page.js` and a database migration, because 10,487 of 12,137 artifacts are
// scripts vendored inside skill packages. Skills — the 1,461 artifacts the
// tool exists to manage — never reached the screen.
const TYPE_PRIORITY = ['skill', 'agent', 'plugin', 'hook', 'slash-command', 'output-style', 'mcp-config'];

const DASHBOARD_ROWS = 40;

function dashboardOrder(a: Artifact, b: Artifact): number {
  const rank = (t: string) => {
    const i = TYPE_PRIORITY.indexOf(t);
    return i === -1 ? TYPE_PRIORITY.length : i;
  };
  return rank(a.type) - rank(b.type) || a.name.localeCompare(b.name);
}

/** Render the catalog browse list, highest-value artifact types first. */
export function renderCatalog(
  artifacts: Artifact[],
  theme: Theme = defaultTheme,
  limit?: number,
): string {
  const ordered = [...artifacts].sort(dashboardOrder);
  const shown = limit && limit > 0 ? ordered.slice(0, limit) : ordered;
  // Say when the list is a slice. A truncated list that does not announce
  // itself reads as the whole catalogue.
  const suffix = shown.length < ordered.length ? ` — showing first ${shown.length}` : '';
  const lines: string[] = [paint(theme, 'heading', `Catalog (${artifacts.length})${suffix}`)];
  if (artifacts.length === 0) {
    lines.push(paint(theme, 'dim', '(empty — run `qm scan`)'));
    return lines.join('\n');
  }
  for (const a of shown) {
    const caps = a.capabilities.map((c) => c.type).join(',');
    lines.push(
      `${paint(theme, 'accent', a.type.padEnd(14))} ${a.name.padEnd(24)} ` +
        paint(theme, 'dim', `${a.organizationalPath}  [${caps}]`),
    );
  }
  return lines.join('\n');
}

/** Build the full dashboard string from repository state. */
export function renderDashboard(repo: Repository, profileDir: string, theme: Theme = defaultTheme): string {
  const artifacts = repo.listArtifacts();
  const profiles = new ProfileRegistry({ profileDirs: [profileDir] }).listProfiles();
  const matrix = computeCompatibilityMatrix(artifacts, profiles);
  const loadouts = repo.listLoadouts();
  const proposals = repo.listProposals();

  return [
    paint(theme, 'title', '⛳ Quartermaster'),
    '',
    renderCatalog(artifacts, theme, DASHBOARD_ROWS),
    '',
    renderMatrix(matrix, profiles.map((p) => p.id), theme),
    '',
    renderLoadouts(loadouts, theme),
    '',
    renderProposals(proposals, theme),
  ].join('\n');
}

/** Launch the TUI: print the dashboard. Returns the rendered frame. */
export function runTui(theme: Theme = defaultTheme): string {
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    const frame = renderDashboard(repo, cfg.profileDir, theme);
    process.stdout.write(`${frame}\n`);
    return frame;
  } finally {
    repo.close();
  }
}
