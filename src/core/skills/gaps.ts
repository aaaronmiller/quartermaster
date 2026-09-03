// ─────────────────────────────────────────────────────────────
// Quartermaster — Gap Intake (D3.7)
// When work exposes a recurring capability gap, the agent records it rather
// than growing the canonical core with a one-off procedural rule.
// Gaps are queryable and feed skill proposals.
// ─────────────────────────────────────────────────────────────

import type { Repository } from '@storage/repository';
import type { GapRecord } from './types';
import { randomBytes } from 'node:crypto';

export function recordGap(
  repo: Repository,
  gap: { capability: string; context: string; createdBy?: string },
): GapRecord {
  if (!gap.capability || gap.capability.trim().length < 3) throw new Error('capability must be at least 3 characters');
  if (!gap.context || gap.context.trim().length < 10) throw new Error('context must be at least 10 characters');
  const rec: GapRecord = {
    id: `gap_${Date.now().toString(36)}_${randomBytes(3).toString('hex')}`,
    capability: gap.capability.trim(),
    context: gap.context.trim(),
    createdAt: new Date().toISOString(),
    createdBy: gap.createdBy ?? 'agent',
    status: 'open',
  };
  repo.db
    .prepare('INSERT INTO skill_gaps (id, capability, context, createdAt, createdBy, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(rec.id, rec.capability, rec.context, rec.createdAt, rec.createdBy, rec.status);
  return rec;
}

export function listGaps(
  repo: Repository,
  opts?: { capability?: string; status?: string; limit?: number },
): GapRecord[] {
  let sql = 'SELECT * FROM skill_gaps';
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts?.capability) {
    conds.push('capability LIKE ?');
    params.push(`%${opts.capability}%`);
  }
  if (opts?.status) {
    conds.push('status = ?');
    params.push(opts.status);
  }
  if (conds.length > 0) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY createdAt DESC';
  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }
  const rows = repo.db.prepare(sql).all(...(params as string[])) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    capability: r.capability as string,
    context: r.context as string,
    createdAt: r.createdAt as string,
    createdBy: r.createdBy as string,
    status: r.status as GapRecord['status'],
  }));
}

export function updateGapStatus(repo: Repository, id: string, status: GapRecord['status']): GapRecord | null {
  const row = repo.db.prepare('SELECT * FROM skill_gaps WHERE id=?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  repo.db.prepare('UPDATE skill_gaps SET status=? WHERE id=?').run(status, id);
  const updated = repo.db.prepare('SELECT * FROM skill_gaps WHERE id=?').get(id) as Record<string, unknown>;
  return {
    id: updated.id as string,
    capability: updated.capability as string,
    context: updated.context as string,
    createdAt: updated.createdAt as string,
    createdBy: updated.createdBy as string,
    status: updated.status as GapRecord['status'],
  };
}
