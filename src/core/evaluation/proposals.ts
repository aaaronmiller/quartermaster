import type { EvaluationProposal, LoadoutDefinition, PipelineDefinition } from '@core/types';
import type { Repository } from '@storage/repository';

export function createProposal(
  repo: Repository,
  type: EvaluationProposal['type'],
  content: unknown,
  rationale: string,
): EvaluationProposal {
  const proposal: EvaluationProposal = {
    id: `proposal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    content,
    rationale,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  repo.saveProposal(proposal);
  return proposal;
}

export function acceptProposal(repo: Repository, id: string): EvaluationProposal {
  const proposal = requireProposal(repo, id);
  const accepted = { ...proposal, status: 'accepted' as const, acceptedAt: new Date().toISOString() };
  if (proposal.type === 'loadout') {
    repo.upsertLoadout(proposal.content as LoadoutDefinition);
  } else if (proposal.type === 'pipeline') {
    repo.upsertPipeline(proposal.content as PipelineDefinition);
  }
  repo.saveProposal(accepted);
  return accepted;
}

export function rejectProposal(repo: Repository, id: string, reason: string): EvaluationProposal {
  const proposal = requireProposal(repo, id);
  const rejected = { ...proposal, status: 'rejected' as const, rejectionReason: reason };
  repo.saveProposal(rejected);
  return rejected;
}

export function editProposal(repo: Repository, id: string, content: unknown): EvaluationProposal {
  const proposal = requireProposal(repo, id);
  const edited = { ...proposal, content };
  repo.saveProposal(edited);
  return edited;
}

function requireProposal(repo: Repository, id: string): EvaluationProposal {
  const proposal = repo.getProposal(id);
  if (!proposal) throw new Error(`proposal not found: ${id}`);
  return proposal;
}
