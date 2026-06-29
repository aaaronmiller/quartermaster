// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm tui` (NFR-052)
// ─────────────────────────────────────────────────────────────

import { runTui } from '../../tui/app';
import { defaultTheme } from '../../tui/theme';
import { type OutputEnvelope, success } from '../output';
import type { ParsedArgs } from '../output';

export function tuiCommand(_args: ParsedArgs): OutputEnvelope {
  runTui(defaultTheme);
  return success('tui', { launched: true, theme: defaultTheme.name });
}
