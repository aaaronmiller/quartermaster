// ─────────────────────────────────────────────────────────────
// Quartermaster — Per-Harness Delivery Matrix (D3.8)
// One registry, many deliveries. Records per harness how skills are surfaced
// and whether Level-0 metadata is available natively or must be injected.
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HarnessDeliveryEntry } from './types';
import { loadConfig } from '@core/config/load';
import { ProfileRegistry } from '@core/profiles/profile-registry';

const HARNESS_INJECTION: Record<string, { injection: HarnessDeliveryEntry['skillInjection']; level0: boolean; mechanism: string; notes?: string }> = {
  'claude-code': { injection: 'native', level0: true, mechanism: 'CLAUDE.md + skill tool injection', notes: 'native Level-0 via bundled skills manifest' },
  'codex': { injection: 'injected', level0: false, mechanism: 'AGENTS.md + qm query search injected', notes: 'Level-0 must be injected via prompt overlay' },
  'hermes': { injection: 'injected', level0: false, mechanism: 'SYSTEM-PROMPT.md overlay + qm query', notes: 'Hermes skill loader lacks native Level-0 manifest' },
  'opencode': { injection: 'native', level0: true, mechanism: 'opencode.yaml skill registry', notes: '' },
  'omp': { injection: 'native', level0: true, mechanism: 'omp skill registry (gstack family)', notes: '' },
  'gemini': { injection: 'injected', level0: false, mechanism: 'AGENTS.md injected', notes: '' },
  'qwen': { injection: 'injected', level0: false, mechanism: 'AGENTS.md injected', notes: '' },
  'kilocode': { injection: 'injected', level0: false, mechanism: 'AGENTS.md injected', notes: '' },
  'pi': { injection: 'injected', level0: false, mechanism: 'pi skills manifest (partial native)', notes: 'Level-0 partially native for pi skills only' },
  'antigravity': { injection: 'injected', level0: false, mechanism: 'antigravity skill file injection', notes: '' },
  'ante': { injection: 'unsupported', level0: false, mechanism: 'no skill injection currently', notes: 'ante harness has no skill surface yet' },
  'openclaw': { injection: 'injected', level0: false, mechanism: 'CLAUDE.md overlay', notes: '' },
  'muse': { injection: 'native', level0: true, mechanism: 'muse skill manifest', notes: '' },
};

export function buildDeliveryMatrix(): HarnessDeliveryEntry[] {
  const cfg = loadConfig();
  const harnesses = cfg.harnesses ?? Object.keys(HARNESS_INJECTION);
  return harnesses.map((h) => {
    const known = HARNESS_INJECTION[h];
    if (known) {
      return { harness: h, skillInjection: known.injection, level0Available: known.level0, mechanism: known.mechanism, notes: known.notes };
    }
    return { harness: h, skillInjection: 'injected', level0Available: false, mechanism: 'AGENTS.md injected (default)', notes: 'unknown harness — default to injected' };
  });
}

export function getDeliveryForHarness(harness: string): HarnessDeliveryEntry | null {
  return buildDeliveryMatrix().find((e) => e.harness === harness) ?? null;
}
