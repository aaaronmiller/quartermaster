// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm loadout`
// CRUD, assignment, cross-harness copy, and status for loadouts.
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { LoadoutError, LoadoutManager } from '@core/loadouts/loadouts';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function loadoutCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, name, third, fourth] = args.positional;
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  const manager = new LoadoutManager(repo);

  try {
    switch (sub) {
      case 'create': {
        if (!name) return failure('loadout', 'usage: qm loadout create <name> [artifactIdsCsv]');
        const artifacts = typeof third === 'string' ? csv(third) : [];
        return success('loadout', { loadout: manager.createNamed(name, artifacts) });
      }
      case 'add': {
        if (!name || !third) return failure('loadout', 'usage: qm loadout add <loadout> <artifactId>');
        return success('loadout', { loadout: manager.addMember(name, 'artifact', third) });
      }
      case 'add-pipeline': {
        if (!name || !third) return failure('loadout', 'usage: qm loadout add-pipeline <loadout> <pipeline>');
        return success('loadout', { loadout: manager.addMember(name, 'pipeline', third) });
      }
      case 'remove': {
        if (!name || !third) return failure('loadout', 'usage: qm loadout remove <loadout> <artifactId>');
        return success('loadout', { loadout: manager.removeMember(name, 'artifact', third) });
      }
      case 'list':
      case undefined:
        return success('loadout', { loadouts: manager.list() });
      case 'assign': {
        if (!name || !third) return failure('loadout', 'usage: qm loadout assign <loadout> <harness>');
        return success('loadout', { loadout: manager.activate(third, name) });
      }
      case 'copy': {
        if (!name || !third || !fourth) {
          return failure('loadout', 'usage: qm loadout copy <loadout> <fromHarness> <toHarness>');
        }
        return success('loadout', { loadout: manager.copyToHarness(name, third, fourth) });
      }
      case 'status': {
        if (!name) return failure('loadout', 'usage: qm loadout status <harness>');
        return success('loadout', manager.status(name));
      }
      default:
        return failure('loadout', `unknown subcommand '${sub}'`);
    }
  } catch (err) {
    if (err instanceof LoadoutError) return failure('loadout', err.message);
    return failure('loadout', (err as Error).message);
  } finally {
    repo.close();
  }
}

function csv(raw: string): string[] {
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}
