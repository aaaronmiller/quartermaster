// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm new <type> <path>`
// Scaffold self-authored artifacts inside the library.
// ─────────────────────────────────────────────────────────────

import { scaffoldArtifact } from '@core/query/commands';
import type { ArtifactType } from '@core/types';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function newCommand(args: ParsedArgs): OutputEnvelope {
  const type = args.positional[0] as ArtifactType | undefined;
  const rawPath = args.positional[1];
  if (!type || !rawPath) return failure('new', 'usage: qm new <type> <path>');
  try {
    return success('new', scaffoldArtifact(type, rawPath));
  } catch (err) {
    return failure('new', (err as Error).message);
  }
}
