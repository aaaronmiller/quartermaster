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
  if (!type || !rawPath)
    return failure('new', 'usage: qm new <type> <path> [--root <path>]  (defaults to the canonical first-party authoring root)');
  const root = typeof args.flags.root === 'string' ? args.flags.root : undefined;
  try {
    return success('new', scaffoldArtifact(type, rawPath, root));
  } catch (err) {
    return failure('new', (err as Error).message);
  }
}
