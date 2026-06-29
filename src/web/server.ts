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

/** Loopback-only host. Never binds a public interface (NFR-030). */
export const LOCAL_HOST = '127.0.0.1';

const THEME_CSS_PATH = new URL('./theme.css', import.meta.url).pathname;

export function htmlResponse(body: string): Response {
  return new Response(body, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** Route a request to a rendered page. Pure w.r.t. the supplied repository. */
export async function handleRequest(repo: Repository, profileDir: string, req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path === '/theme.css') {
    return new Response(await Bun.file(THEME_CSS_PATH).text(), {
      headers: { 'Content-Type': 'text/css' },
    });
  }

  // Advisory proposal actions (POST) — same lifecycle as the CLI.
  const action = path.match(/^\/proposals\/([^/]+)\/(accept|reject)$/);
  if (action && req.method === 'POST') {
    const [, id, verb] = action;
    try {
      if (verb === 'accept') acceptProposal(repo, id!);
      else rejectProposal(repo, id!, 'rejected via web');
    } catch {
      // fall through to re-render; failures surface as unchanged status
    }
    return new Response(null, { status: 303, headers: { Location: '/proposals' } });
  }

  switch (path) {
    case '/':
    case '/catalog':
      return htmlResponse(renderCatalogPage(repo.listArtifacts()));
    case '/matrix': {
      const artifacts = repo.listArtifacts();
      const profiles = new ProfileRegistry({ profileDirs: [profileDir] }).listProfiles();
      const matrix = computeCompatibilityMatrix(artifacts, profiles);
      return htmlResponse(renderMatrixPage(matrix, profiles.map((p) => p.id)));
    }
    case '/loadouts':
      return htmlResponse(renderLoadoutsPage(repo.listLoadouts()));
    case '/proposals':
      return htmlResponse(renderProposalsPage(repo.listProposals()));
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
 * Start the local web server. Binds 127.0.0.1 only. `port: 0` lets the OS
 * choose a free port (used by tests).
 */
export function startWebServer(config: QuartermasterConfig = loadConfig(), port = 4319): WebServerHandle {
  const repo = new Repository({ dbPath: config.dbPath });
  const server = Bun.serve({
    hostname: LOCAL_HOST,
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
