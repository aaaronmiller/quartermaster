// ─────────────────────────────────────────────────────────────
// Quartermaster -- `qm web` (NFR-052)
// Serves the local, dark-mode-first web interface on localhost.
// In WSL2, binds 0.0.0.0 so the server is reachable from Windows.
// Keeps the process alive until SIGINT/SIGTERM.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { startWebServer, LOCAL_HOST } from '../../web/server';
import { type OutputEnvelope, success } from '../output';
import type { ParsedArgs } from '../output';

function isWsl2(): boolean {
  if (typeof process !== 'object' || !process || !process.platform) return false;
  if (process.platform !== 'linux') return false;
  try {
    const release = require('fs').readFileSync('/proc/version', 'utf8').toLowerCase();
    return release.includes('microsoft') || release.includes('wsl');
  } catch {
    return false;
  }
}

/** Wait until interrupted. Resolves on SIGINT/SIGTERM. */
function untilInterrupted(): Promise<void> {
  return new Promise((resolve) => {
    const done = () => resolve();
    process.on('SIGINT', done);
    process.on('SIGTERM', done);
  });
}

export async function webCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const cfg = loadConfig();
  const port = typeof args.flags.port === 'string' ? Number(args.flags.port) : 4319;
  const wsl = isWsl2();
  const host = wsl ? '0.0.0.0' : LOCAL_HOST;
  const handle = startWebServer(cfg, port, host);
  const url = wsl ? `http://localhost:${handle.port}` : handle.url;
  process.stdout.write(`Quartermaster web UI on ${url} (Ctrl-C to stop)\n`);
  await untilInterrupted();
  handle.stop();
  return success('web', { url, host, port: handle.port, wsl, status: 'stopped' });
}
