// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm compose`
// Optional composition validation surface.
// ─────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { validateComposition } from '@core/composition';
import type { CompositionChain } from '@core/composition';
import { loadConfig } from '@core/config/load';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function composeCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, file] = args.positional;
  if (sub !== 'validate' || !file) {
    return failure('compose', 'usage: qm compose validate <chain.json>');
  }

  try {
    const chain = JSON.parse(readFileSync(file, 'utf8')) as CompositionChain;
    const cfg = loadConfig();
    const result = validateComposition(chain, { enabled: cfg.composition.enabled });
    return success('compose', result);
  } catch (err) {
    return failure('compose', (err as Error).message);
  }
}
