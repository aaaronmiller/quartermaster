// ─────────────────────────────────────────────────────────────
// Quartermaster — local web server (NFR-052, NFR-030)
// Serves the same engine over HTTP, bound to localhost only. No
// external/telemetry calls; advisory proposal actions reuse the
// deterministic proposal lifecycle.
// ─────────────────────────────────────────────────────────────

import { computeCompatibilityMatrix } from '@core/audit/auditor';
import { loadConfig } from '@core/config/load';
import type { QuartermasterConfig } from '@core/config/schema';
import { acceptProposal, rejectProposal } from '@core/evaluation/proposals';
import { ProfileRegistry } from '@core/profiles/profile-registry';
import { Repository } from '@storage/repository';
import { renderCatalogPage } from './routes/catalog';
import { renderMatrixPage } from './routes/matrix';
import { renderLoadoutsPage } from './routes/loadouts';
import { renderProposalsPage } from './routes/proposals';
import { parseScope } from './routes/scope';

/** Loopback-only host. Never binds a public interface (NFR-030). */
export const LOCAL_HOST = '127.0.0.1';

// Imported as text so the bundler embeds the bytes in the compiled binary.
// `new URL('./theme.css', import.meta.url).pathname` resolves to a path that
// exists in the source tree but not inside `bun build --compile` output, so
// `/theme.css` returned 500 from the installed `qm` while passing its test
// against the source tree. The same applies to the animations script.
import THEME_CSS from './theme.css' with { type: 'text' };
import ANIMATIONS_JS from './assets/js/animations.js' with { type: 'text' };

export function htmlResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** Route a request to a rendered page. Pure w.r.t. the supplied repository. */
export async function handleRequest(repo: Repository, profileDir: string, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/theme.css') {
    return new Response(THEME_CSS, { headers: { 'Content-Type': 'text/css' } });
  }

  if (path === '/assets/js/animations.js') {
    return new Response(ANIMATIONS_JS, { headers: { 'Content-Type': 'application/javascript' } });
  }

  // Advisory proposal actions (POST) — same lifecycle as the CLI.
  const action = path.match(/^\/proposals\/([^/]+)\/(accept|reject)$/);
  if (action && req.method === 'POST') {
    const [, id, verb] = action;
    if (!id) return new Response('invalid proposal id', { status: 400 });
    try {
      if (verb === 'accept') acceptProposal(repo, id);
      else rejectProposal(repo, id, 'rejected via web');
    } catch {
      // fall through to re-render; failures surface as unchanged status
    }
    return new Response(null, { status: 303, headers: { Location: '/proposals' } });
  }

  switch (path) {
    case '/':
    case '/catalog':
      // Default the catalogue to skills. 10,487 of 12,137 artifacts are
      // scripts inside skill packages, so an unfiltered first screen buries
      // what the tool manages. `?type=all` opts out.
      return htmlResponse(renderCatalogPage(repo.listArtifacts(), path, parseScope(url, 'skill')));
    case '/matrix': {
      const artifacts = repo.listArtifacts();
      const profiles = new ProfileRegistry({ profileDirs: [profileDir] }).listProfiles();
      const scope = parseScope(url, 'skill');
      const scoped = scope.type ? artifacts.filter((a) => a.type === scope.type) : artifacts;
      const matrix = computeCompatibilityMatrix(scoped, profiles);
      return htmlResponse(renderMatrixPage(matrix, profiles.map((p) => p.id), path, scope));
    }
    case '/loadouts':
      return htmlResponse(renderLoadoutsPage(repo.listLoadouts(), path));
    case '/proposals':
      return htmlResponse(renderProposalsPage(repo.listProposals(), path));
    default:
      return new Response('Not Found', { status: 404 });
  }
}

export interface WebServerHandle {
  port: number;
  url: string;
  stop: () => void;
}

/**
 * Start the local web server. Binds 127.0.0.1 by default; pass 0.0.0.0
 * for WSL2 so the server is reachable from the Windows host.
 */
export function startWebServer(config: QuartermasterConfig = loadConfig(), port = 4319, host = LOCAL_HOST): WebServerHandle {
  const repo = new Repository({ dbPath: config.dbPath });
  const server = Bun.serve({
    hostname: host,
    port,
    fetch: (req) => handleRequest(repo, config.profileDir, req),
  });
  const boundPort = server.port ?? port;
  return {
    port: boundPort,
    url: `http://${LOCAL_HOST}:${boundPort}`,
    stop: () => {
      server.stop(true);
      repo.close();
    },
  };
}
