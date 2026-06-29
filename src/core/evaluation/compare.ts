import type { QuartermasterConfig } from '@core/config/schema';
import type { Artifact } from '@core/types';
import { resolveGatewayConfig, singleTurn, type GatewayCallOptions } from './gateway';
import { parseJsonContent } from './json';

export interface CompareResult {
  ranked: Array<{ artifactId: string; rank: number; reason: string }>;
  recommendation: string;
  model: string;
}

export async function compareArtifacts(
  artifacts: Artifact[],
  config: QuartermasterConfig,
  options: GatewayCallOptions = {},
): Promise<CompareResult> {
  const prompt = JSON.stringify({
    task: 'compare',
    artifacts: artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      metadata: artifact.metadata,
    })),
    output: { ranked: [{ artifactId: 'id', rank: 1, reason: 'why' }], recommendation: 'choice' },
  });
  const gateway = resolveGatewayConfig(config, 'bulk');
  const response = await singleTurn(prompt, gateway, options);
  return { ...parseJsonContent<Omit<CompareResult, 'model'>>(response.content), model: response.model };
}
