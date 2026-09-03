// ─────────────────────────────────────────────────────────────
// Quartermaster — Skill Usage Event Emitter (D3.5)
// Emitted on skill load and on task outcome. Without it, a skill that is
// never loaded looks identical to a skill that is loaded and useless.
// Fields: skill, version, trigger, whether opened past L0, outcome, clauseId.
// ─────────────────────────────────────────────────────────────

import type { Repository } from '@storage/repository';
import type { UsageEvent } from './types';
import { randomBytes } from 'node:crypto';

export function emitUsageEvent(
  repo: Repository,
  event: Omit<UsageEvent, 'id' | 'timestamp'> & { timestamp?: string },
): UsageEvent {
  const id = `evt_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
  const timestamp = event.timestamp ?? new Date().toISOString();
  const full: UsageEvent = {
    id,
    skill: event.skill,
    version: event.version,
    trigger: event.trigger,
    openedPastLevel0: event.openedPastLevel0,
    outcome: event.outcome,
    clauseId: event.clauseId,
    timestamp,
  };
  // Validate against contracts schema (lightweight)
  validateEvent(full);
  repo.db
    .prepare(
      'INSERT INTO skill_events (id, skill, version, trigger, openedPastLevel0, outcome, clauseId, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(
      full.id,
      full.skill,
      full.version ?? null,
      full.trigger,
      full.openedPastLevel0 ? 1 : 0,
      full.outcome ?? null,
      full.clauseId ?? null,
      full.timestamp,
    );
  return full;
}

export function listUsageEvents(
  repo: Repository,
  opts?: { skill?: string; since?: string; limit?: number },
): UsageEvent[] {
  let sql = 'SELECT * FROM skill_events';
  const conds: string[] = [];
  const params: unknown[] = [];
  if (opts?.skill) {
    conds.push('skill = ?');
    params.push(opts.skill);
  }
  if (opts?.since) {
    conds.push('timestamp >= ?');
    params.push(opts.since);
  }
  if (conds.length > 0) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY timestamp DESC';
  if (opts?.limit) {
    sql += ' LIMIT ?';
    params.push(opts.limit);
  }
  const rows = repo.db.prepare(sql).all(...(params as string[])) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as string,
    skill: r.skill as string,
    version: (r.version as string | null) ?? undefined,
    trigger: r.trigger as UsageEvent['trigger'],
    openedPastLevel0: (r.openedPastLevel0 as number) === 1,
    outcome: (r.outcome as UsageEvent['outcome']) ?? undefined,
    clauseId: (r.clauseId as string | null) ?? undefined,
    timestamp: r.timestamp as string,
  }));
}

function validateEvent(e: UsageEvent): void {
  if (!e.skill || e.skill.trim().length === 0) throw new Error('skill is required');
  if (!['before_create', 'task_start', 'explicit'].includes(e.trigger)) throw new Error(`invalid trigger: ${e.trigger}`);
  if (e.outcome && !['accepted', 'reworked', 'escalated', 'abandoned', 'unknown'].includes(e.outcome))
    throw new Error(`invalid outcome: ${e.outcome}`);
}
