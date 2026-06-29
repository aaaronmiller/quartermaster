import { readFileSync } from 'node:fs';
import type { QuartermasterConfig } from '@core/config/schema';
import type { Artifact, GatewayResponse } from '@core/types';
import { parseJsonContent } from './json';
import { resolveGatewayConfig, singleTurn, type GatewayCallOptions } from './gateway';

export interface GradeCategory {
  category: string;
  score: number;
  rationale: string;
}

export interface GradeResult {
  artifactId: string;
  categories: GradeCategory[];
  rationale: string;
  model: string;
  bodyRead: boolean;
}

export interface GradeOptions extends GatewayCallOptions {
  mode?: 'single' | 'multi';
}

export async function gradeArtifact(
  artifact: Artifact,
  categories: string[],
  config: QuartermasterConfig,
  options: GradeOptions = {},
): Promise<GradeResult> {
  const mode = options.mode ?? 'single';
  const body = mode === 'multi' ? readFileSync(artifact.path, 'utf8') : '';
  const prompt = JSON.stringify({
    task: 'grade',
    artifact: {
      id: artifact.id,
      name: artifact.name,
      type: artifact.type,
      metadata: artifact.metadata,
      ...(body ? { body } : {}),
    },
    categories,
    output: { categories: [{ category: 'name', score: 0.5, rationale: 'why' }], rationale: 'summary' },
  });
  const gateway = resolveGatewayConfig(config, mode === 'multi' ? 'deep' : 'bulk');
  const response = await singleTurn(prompt, gateway, options);
  return normalizeGrade(artifact.id, categories, response, body.length > 0);
}

function normalizeGrade(
  artifactId: string,
  requested: string[],
  response: GatewayResponse,
  bodyRead: boolean,
): GradeResult {
  const parsed = parseJsonContent<{ categories: GradeCategory[]; rationale: string }>(response.content);
  const byName = new Map(parsed.categories.map((category) => [category.category, category]));
  return {
    artifactId,
    categories: requested.map((category) => byName.get(category) ?? { category, score: 0, rationale: 'not scored' }),
    rationale: parsed.rationale,
    model: response.model,
    bodyRead,
  };
}
