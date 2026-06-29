// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm web` (NFR-052)
// Serves the local, dark-mode-first web interface on localhost.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { startWebServer } from '../../web/server';
import { type OutputEnvelope, success } from '../output';
import type { ParsedArgs } from '../output';

export function webCommand(args: ParsedArgs): OutputEnvelope {
  const cfg = loadConfig();
  const port = typeof args.flags.port === 'string' ? Number(args.flags.port) : 4319;
  const handle = startWebServer(cfg, port);
  process.stdout.write(`Quartermaster web UI on ${handle.url} (Ctrl-C to stop)\n`);
  // Server runs until the process is interrupted.
  return success('web', { url: handle.url, host: '127.0.0.1', port: handle.port });
}
