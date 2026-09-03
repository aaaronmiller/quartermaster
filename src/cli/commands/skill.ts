// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm skill` + `qm gap` CLI (Phase 3 Skill Registry)
// Covers D3.2 discovery, D3.3 dedupe, D3.5 events, D3.6 vetted, D3.7 gap,
// D3.8 matrix, plus aliases. Local-first, metadata-only (C3), budget-aware (C1).
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';
import { discoverySearch, getLevel1, getLevel2, resolveSkill } from '@core/skills/discovery';
import { dedupeSearch } from '@core/skills/dedupe';
import { emitUsageEvent, listUsageEvents } from '@core/skills/events';
import { listGaps, recordGap } from '@core/skills/gaps';
import { isVetted } from '@core/skills/vetted';
import { buildDeliveryMatrix, getDeliveryForHarness } from '@core/skills/matrix';

export function skillCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, ...rest] = args.positional;
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    switch (sub) {
      case 'search': {
        const text = rest[0] ?? (args.flags.text as string) ?? (args.flags.capability as string) ?? '';
        const capability = args.flags.capability as string | undefined;
        const statusFlag = args.flags.status as string | undefined;
        const limit = args.flags.limit ? Number(args.flags.limit) : 20;
        const includeDisabled = args.flags.includeDisabled !== 'false';
        const includeArchived = args.flags.includeArchived !== 'false';
        if (!text && !capability) return failure('skill', 'usage: qm skill search <text> [--capability <c>] [--status <s>] [--limit N]');
        const result = discoverySearch(repo, {
          ...(text ? { text } : {}),
          ...(capability ? { capability } : {}),
          ...(statusFlag ? { status: statusFlag as never } : {}),
          limit,
          includeDisabled,
          includeArchived,
        });
        return success('skill', { command: 'search', ...result });
      }

      case 'get': {
        const ref = rest[0];
        const level = (args.flags.level as string) ?? '0';
        if (!ref) return failure('skill', 'usage: qm skill get <ref> [--level 0|1|2]');
        const resolved = resolveSkill(repo, ref);
        if (!resolved) return failure('skill', `skill not found: ${ref}`);
        if (level === '0') return success('skill', { level: 0, skill: resolved });
        if (level === '1') {
          const l1 = getLevel1(repo, resolved.artifactId);
          if (!l1) return failure('skill', `failed to load Level-1 for ${resolved.name}`);
          return success('skill', { level: 1, skill: resolved, body: l1.body, frontmatter: l1.frontmatter });
        }
        if (level === '2') {
          const l2 = getLevel2(repo, resolved.artifactId);
          if (!l2) return failure('skill', `failed to load Level-2 for ${resolved.name}`);
          return success('skill', { level: 2, skill: resolved, ...l2 });
        }
        return failure('skill', 'level must be 0, 1, or 2');
      }

      case 'resolve': {
        const ref = rest[0];
        if (!ref) return failure('skill', 'usage: qm skill resolve <ref>');
        const resolved = resolveSkill(repo, ref);
        if (!resolved) return failure('skill', `skill not found: ${ref}`);
        return success('skill', { command: 'resolve', skill: resolved, supersededResolved: resolved.status !== 'superseded' });
      }

      case 'dedupe': {
        const text = rest.join(' ') || (args.flags.capability as string) || '';
        if (!text) return failure('skill', 'usage: qm skill dedupe <text>  — capability query, not name');
        const cap = args.flags.capability as string | undefined;
        const result = dedupeSearch(repo, {
          text,
          ...(cap ? { capability: cap } : {}),
          limit: Number(args.flags.limit ?? 20),
        });
        return success('skill', { command: 'dedupe', ...result });
      }

      case 'vetted': {
        const ref = rest[0];
        if (!ref) return failure('skill', 'usage: qm skill vetted <skill-name>');
        const result = isVetted(repo, ref);
        return success('skill', { command: 'vetted', ...result });
      }

      case 'matrix': {
        const harness = rest[0];
        if (harness) {
          const entry = getDeliveryForHarness(harness);
          if (!entry) return failure('skill', `unknown harness: ${harness}`);
          return success('skill', { command: 'matrix', harness, entry });
        }
        return success('skill', { command: 'matrix', matrix: buildDeliveryMatrix() });
      }

      case 'event': {
        const action = rest[0];
        if (action === 'emit') {
          const skill = (args.flags.skill as string) ?? rest[1];
          const trigger = (args.flags.trigger as string) ?? (rest[2] as string) ?? 'explicit';
          const openedPastLevel0 = args.flags.openedPastLevel0 !== 'false' && args.flags.openedPastLevel0 !== false;
          const outcome = args.flags.outcome as string | undefined;
          const clauseId = args.flags.clause as string | undefined;
          const version = args.flags.version as string | undefined;
          if (!skill) return failure('skill', 'usage: qm skill event emit --skill <name> [--trigger before_create|task_start|explicit] [--openedPastLevel0 true|false] [--outcome accepted|reworked|escalated|abandoned] [--clause <id>] [--version <v>]');
          try {
            const evt = emitUsageEvent(repo, {
              skill,
              ...(version ? { version } : {}),
              trigger: trigger as never,
              openedPastLevel0: Boolean(openedPastLevel0),
              ...(outcome ? { outcome: outcome as never } : {}),
              ...(clauseId ? { clauseId } : {}),
            });
            return success('skill', { command: 'event', event: evt });
          } catch (e) {
            return failure('skill', (e as Error).message);
          }
        }
        if (action === 'list') {
          const skillFilter = args.flags.skill as string | undefined;
          const evts = listUsageEvents(repo, {
            ...(skillFilter ? { skill: skillFilter } : {}),
            limit: Number(args.flags.limit ?? 50),
          });
          return success('skill', { command: 'event', events: evts });
        }
        return failure('skill', 'usage: qm skill event emit|list');
      }

      case 'gap': {
        const action = rest[0];
        if (action === 'record') {
          const capability = (args.flags.capability as string) ?? rest[1];
          const context = (args.flags.context as string) ?? rest.slice(2).join(' ');
          if (!capability) return failure('skill', 'usage: qm skill gap record --capability <cap> --context <text>');
          if (!context) return failure('skill', 'usage: --context is required (at least 10 chars)');
          try {
            const gap = recordGap(repo, { capability, context });
            return success('skill', { command: 'gap', gap });
          } catch (e) {
            return failure('skill', (e as Error).message);
          }
        }
        if (action === 'list' || action === undefined) {
          const cap = args.flags.capability as string | undefined;
          const gaps = listGaps(repo, {
            ...(cap ? { capability: cap } : {}),
            limit: Number(args.flags.limit ?? 50),
          });
          return success('skill', { command: 'gap', gaps });
        }
        return failure('skill', 'usage: qm skill gap record|list');
      }

      default:
        return failure('skill', 'usage: qm skill search|get|resolve|dedupe|vetted|matrix|event|gap');
    }
  } finally {
    repo.close();
  }
}

export function gapCommand(args: ParsedArgs): OutputEnvelope {
  const gapArgs: ParsedArgs = {
    command: args.command,
    positional: ['gap', ...args.positional],
    flags: args.flags,
  };
  return skillCommand(gapArgs);
}
