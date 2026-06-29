// ─────────────────────────────────────────────────────────────
// Quartermaster — Pipeline Proposer (FR-111)
// Agentically proposes candidate pipelines based on skill
// descriptions and optional developer instructions.
// ─────────────────────────────────────────────────────────────

import type { Artifact, PipelineDefinition, GatewayConfig } from '@core/types';
import { resolveGatewayConfig, singleTurn } from '@core/evaluation/gateway';
import { parseJsonContent } from '@core/evaluation/json';
import type { QuartermasterConfig } from '@core/config/schema';

export interface PipelineProposal {
  name: string;
  description: string;
  artifacts: string[];
  directives: Record<string, unknown>;
  rationale: string;
}

export interface ProposeOptions {
  fetchImpl?: typeof fetch;
  instruction?: string;
}

/**
 * Propose candidate pipelines by sending skill descriptions to the model.
 * Uses single-turn (metadata only) for efficiency.
 */
export async function proposePipelines(
  artifacts: Artifact[],
  config: QuartermasterConfig,
  options: ProposeOptions = {},
): Promise<PipelineProposal[]> {
  const gateway = resolveGatewayConfig(config, 'bulk');

  const artifactSummaries = artifacts
    .map((a) => `- ${a.id}: ${a.metadata?.description ?? a.name} (${a.type})`)
    .join('\n');

  const instruction = options.instruction
    ? `\n\nDeveloper instruction: ${options.instruction}`
    : '';

  const prompt = JSON.stringify({
    task: 'propose-pipelines',
    artifacts: artifactSummaries,
    instruction,
    output: {
      pipelines: [
        {
          name: 'pipeline-name',
          description: 'what this pipeline does',
          artifacts: ['artifact-id-1', 'artifact-id-2'],
          directives: { priority: 10 },
          rationale: 'why these artifacts work together',
        },
      ],
    },
  });

  const callOptions: { fetchImpl?: typeof fetch } = {};
  if (options.fetchImpl) callOptions.fetchImpl = options.fetchImpl;
  const response = await singleTurn(prompt, gateway, callOptions);
  const parsed = parseJsonContent<{ pipelines: PipelineProposal[] }>(response.content);

  return parsed.pipelines ?? [];
}

/**
 * Accept a proposed pipeline: persist it to the pipelines table.
 */
export function acceptPipelineProposal(
  repo: import('@storage/repository').Repository,
  proposal: PipelineProposal,
): PipelineDefinition {
  const pipeline: PipelineDefinition = {
    name: proposal.name,
    artifacts: proposal.artifacts,
    directives: proposal.directives,
  };

  // Use PipelineManager to create the pipeline
  const { PipelineManager } = require('./pipelines');
  const manager = new PipelineManager(repo);
  manager.create(pipeline);

  return pipeline;
}