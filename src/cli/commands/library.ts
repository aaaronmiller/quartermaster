import { loadConfig } from '@core/config/load';
import {
  applySourceLibrary,
  loadSourceRegistry,
  planSourceLibrary,
  rollbackSourceLibrary,
} from '@core/library/source-registry';
import type { OutputEnvelope, ParsedArgs } from '../output';
import { failure, success } from '../output';

export function libraryCommand(args: ParsedArgs): OutputEnvelope {
  const subcommand = args.positional[0] ?? 'prepare';
  const config = loadConfig();
  const registryPath = args.positional[1] ?? config.sourceRegistry;

  if (subcommand === 'validate') {
    const registry = loadSourceRegistry(registryPath);
    return success('library', { registryPath, sources: registry.sources.length, libraryRoot: registry.libraryRoot });
  }
  if (subcommand === 'prepare') {
    const plan = planSourceLibrary(registryPath);
    if (args.flags.yes !== true) return success('library', { ...plan, mode: 'dry-run' });
    if (plan.conflicts.length > 0) return failure('library', `source library has ${plan.conflicts.length} conflict(s)`);
    return success('library', applySourceLibrary(plan));
  }
  if (subcommand === 'rollback') {
    const record = args.positional[1];
    if (!record) return failure('library', 'usage: qm library rollback <operation-record>');
    return success('library', { record, removed: rollbackSourceLibrary(record) });
  }
  return failure('library', 'usage: qm library validate|prepare [registry] [--yes] | rollback <record>');
}
