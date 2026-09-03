// ─────────────────────────────────────────────────────────────
// Quartermaster — Dedupe Query (D3.3)
// "Am I about to duplicate something" answered by capability, not by name.
// Reports retrieval rate against a held-out set honestly.
// ─────────────────────────────────────────────────────────────

import type { Repository } from '@storage/repository';
import type { DedupeQuery, DedupeResult, HeldOutMetrics, Level0Metadata } from './types';
import { artifactToLevel0 } from './discovery';
import { existsSync, readFileSync } from 'node:fs';

function dedupeScore(l0: Level0Metadata, query: DedupeQuery): { score: number; reason: string } {
  const q = (query.text ?? query.capability ?? '').toLowerCase();
  if (!q) return { score: 0, reason: 'no query' };
  const qTokens = new Set(q.split(/\s+/).filter(Boolean));
  const triggerTokens = new Set(l0.triggers.flatMap((t) => t.split(/\s+/)));
  const descTokens = new Set(l0.description.toLowerCase().split(/\s+/));
  let overlap = 0;
  const reasonParts: string[] = [];
  for (const qt of qTokens) {
    if ([...triggerTokens].some((t) => t.includes(qt) || qt.includes(t))) {
      overlap += 3;
      reasonParts.push(`trigger:${qt}`);
    } else if ([...descTokens].some((t) => t.includes(qt))) {
      overlap += 1;
      reasonParts.push(`desc:${qt}`);
    }
    if (l0.name.toLowerCase().includes(qt)) {
      overlap += 2;
      reasonParts.push(`name:${qt}`);
    }
  }
  const intersection = [...qTokens].filter((t) => [...triggerTokens].some((tt) => tt.includes(t))).length;
  const union = new Set([...qTokens, ...triggerTokens]).size;
  const jaccard = union > 0 ? intersection / union : 0;
  const score = overlap + jaccard * 5;
  return { score, reason: reasonParts.join(', ') || 'no token overlap' };
}

export function dedupeSearch(repo: Repository, query: DedupeQuery): DedupeResult {
  const statesRows = repo.db.prepare('SELECT artifactId, status, reason, supersededBy FROM skill_states').all() as Array<{
    artifactId: string;
    status: string;
    reason: string | null;
    supersededBy: string | null;
  }>;
  const statesMap = new Map(statesRows.map((r) => [r.artifactId, r] as const));
  const artifacts = repo.listArtifacts().filter((a) => a.type === 'skill');
  const level0s = artifacts.map((a) => artifactToLevel0(a, repo, statesMap as never));
  const scored = level0s
    .map((l0) => {
      const { score, reason } = dedupeScore(l0, query);
      return { l0, score, reason };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.l0.name.localeCompare(b.l0.name));

  const totalCandidates = scored.length;
  const limit = Math.min(query.limit ?? 20, 100);
  const top = scored.slice(0, limit);
  const results = top.map((s) => ({ ...s.l0, dedupeScore: s.score, dedupeReason: s.reason }));

  let heldOutMetrics: HeldOutMetrics | undefined;
  const labelledPath = 'data/labelled-queries.jsonl';
  try {
    if (existsSync(labelledPath)) {
      const lines = readFileSync(labelledPath, 'utf-8').trim().split('\n').filter(Boolean);
      const labelled = lines.map((l) => JSON.parse(l));
      const split = Math.floor(labelled.length * 0.8);
      const heldOut = labelled.slice(split);
      if (heldOut.length > 0) {
        let top1 = 0;
        let top5 = 0;
        let mrrSum = 0;
        for (const entry of heldOut) {
          const qText: string = entry.query ?? entry.text ?? '';
          const expected: string = (entry.expectedSkill ?? entry.skill ?? '').toLowerCase();
          const ranked = level0s
            .map((l0) => ({ l0, s: dedupeScore(l0, { text: qText }).score }))
            .sort((a, b) => b.s - a.s);
          const rank = ranked.findIndex((r) => r.l0.name.toLowerCase() === expected);
          if (rank === 0) top1 += 1;
          if (rank >= 0 && rank < 5) top5 += 1;
          if (rank >= 0) mrrSum += 1 / (rank + 1);
        }
        heldOutMetrics = {
          heldOutSize: heldOut.length,
          top1Accuracy: heldOut.length ? top1 / heldOut.length : 0,
          top5Recall: heldOut.length ? top5 / heldOut.length : 0,
          mrr: heldOut.length ? mrrSum / heldOut.length : 0,
          notes: `held-out from ${labelledPath} (${split}/${labelled.length} train/test split)`,
        };
      }
    } else {
      heldOutMetrics = {
        heldOutSize: 0,
        top1Accuracy: 0,
        top5Recall: 0,
        mrr: 0,
        notes: `no labelled set at ${labelledPath} — metric is unmeasured (honest baseline: 0)`,
      };
    }
  } catch (e) {
    heldOutMetrics = {
      heldOutSize: 0,
      top1Accuracy: 0,
      top5Recall: 0,
      mrr: 0,
      notes: `failed to compute held-out metrics: ${(e as Error).message}`,
    };
  }

  return { query, totalCandidates, results, heldOutMetrics };
}
