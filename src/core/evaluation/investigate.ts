import { readFileSync } from 'node:fs';
import type { QuartermasterConfig } from '@core/config/schema';
import type { Artifact } from '@core/types';
import { multiTurn, resolveGatewayConfig, type GatewayCallOptions } from './gateway';
import { parseJsonContent } from './json';

export interface InvestigationResult {
  artifactId: string;
  summary: string;
  filesRead: string[];
  turnsUsed: number;
  model: string;
}

export async function investigateArtifact(
  artifact: Artifact,
  config: QuartermasterConfig,
  turns: number,
  options: GatewayCallOptions = {},
): Promise<InvestigationResult> {
  if (turns > config.eval.turnBudget) {
    throw new Error(`turn budget exceeded: requested ${turns}, max ${config.eval.turnBudget}`);
  }
  const body = readFileSync(artifact.path, 'utf8');
  const gateway = resolveGatewayConfig(config, 'deep');
  const response = await multiTurn(
    [
      { role: 'user', content: JSON.stringify({ task: 'investigate', artifactId: artifact.id, body }) },
    ],
    gateway,
    options,
  );
  return {
    ...parseJsonContent<Omit<InvestigationResult, 'artifactId' | 'filesRead' | 'turnsUsed' | 'model'>>(response.content),
    artifactId: artifact.id,
    filesRead: [artifact.path],
    turnsUsed: turns,
    model: response.model,
  };
}
