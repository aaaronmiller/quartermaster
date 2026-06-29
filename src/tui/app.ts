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

/** Render the catalog browse list. */
export function renderCatalog(artifacts: Artifact[], theme: Theme = defaultTheme): string {
  const lines: string[] = [paint(theme, 'heading', `Catalog (${artifacts.length})`)];
  if (artifacts.length === 0) {
    lines.push(paint(theme, 'dim', '(empty — run `qm scan`)'));
    return lines.join('\n');
  }
  for (const a of artifacts) {
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
    renderCatalog(artifacts, theme),
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
