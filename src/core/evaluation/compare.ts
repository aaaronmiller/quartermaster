import { readFileSync, statSync } from 'node:fs';
import type { QuartermasterConfig } from '@core/config/schema';
import type { Artifact } from '@core/types';
import { resolveGatewayConfig, singleTurn, type GatewayCallOptions } from './gateway';
import { parseJsonContent } from './json';

export interface CompareResult {
  ranked: Array<{ artifactId: string; rank: number; reason: string }>;
  recommendation: string;
  model: string;
  bodiesRead: number;
  truncated: string[];
}

export interface CompareOptions extends GatewayCallOptions {
  mode?: 'single' | 'multi';
}

// A comparison run on metadata alone can only rank descriptions. Asked to pick
// between two variants of `frontend-design-masterclass` on 2026-08-21, the
// model returned a correct ranking hedged with "functionally identical if
// SKILL.md content is same" — it had never been shown either body. For the
// question this command exists to answer, which of these near-duplicate skills
// is actually better, the body is the evidence.
//
// Bodies are capped because the catalogue contains genuine outliers: one
// `last30days` SKILL.md is 17,384,200 bytes. Sending that whole would blow any
// context window and cost real money to be told nothing. Truncated artifacts
// are named in the result so a caller never mistakes a partial read for a
// complete one.
const MAX_BODY_BYTES = 120_000;

function readBody(artifact: Artifact): { body: string; truncated: boolean } {
  try {
    const size = statSync(artifact.path).size;
    const raw = readFileSync(artifact.path, 'utf8');
    if (size <= MAX_BODY_BYTES) return { body: raw, truncated: false };
    return { body: raw.slice(0, MAX_BODY_BYTES), truncated: true };
  } catch {
    // A catalogued path can be missing or unreadable — a deployment whose
    // source moved, for instance. Rank it on metadata rather than failing the
    // whole comparison.
    return { body: '', truncated: false };
  }
}

export async function compareArtifacts(
  artifacts: Artifact[],
  config: QuartermasterConfig,
  options: CompareOptions = {},
): Promise<CompareResult> {
  const mode = options.mode ?? 'single';
  const truncated: string[] = [];
  let bodiesRead = 0;

  const entries = artifacts.map((artifact) => {
    const base = {
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      metadata: artifact.metadata,
    };
    if (mode !== 'multi') return base;

    const { body, truncated: cut } = readBody(artifact);
    if (!body) return base;
    bodiesRead += 1;
    if (cut) truncated.push(artifact.id);
    return { ...base, body, ...(cut ? { bodyTruncated: true } : {}) };
  });

  const prompt = JSON.stringify({
    task: 'compare',
    artifacts: entries,
    output: { ranked: [{ artifactId: 'id', rank: 1, reason: 'why' }], recommendation: 'choice' },
  });
  const gateway = resolveGatewayConfig(config, mode === 'multi' ? 'deep' : 'bulk');
  const response = await singleTurn(prompt, gateway, options);
  return {
    ...parseJsonContent<Omit<CompareResult, 'model' | 'bodiesRead' | 'truncated'>>(response.content),
    model: response.model,
    bodiesRead,
    truncated,
  };
}
