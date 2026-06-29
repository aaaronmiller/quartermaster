// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm query` CLI command
// FR-130, FR-131: Agent query interface
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { queryArtifacts, queryArtifact, queryCompatibility, queryDeployment, querySearch, scaffoldArtifact } from '@core/query/commands';
import type { ArtifactType } from '@core/types';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function queryCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, id, first, second] = args.positional;
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });

  try {
    switch (sub) {
      case 'list':
      case 'list-skills':
        return success('query', queryArtifacts(repo));

      case 'search':
        const searchOpts: { text?: string; type?: string; capability?: string } = {};
        if (args.flags.text) searchOpts.text = args.flags.text as string;
        if (args.flags.type) searchOpts.type = args.flags.type as string;
        if (args.flags.capability) searchOpts.capability = args.flags.capability as string;
        return success('query', querySearch(repo, searchOpts));

      case 'get':
        if (!id) return failure('query', 'usage: qm query get <artifact-id>');
        const artifact = queryArtifact(repo, id);
        if (!artifact) return failure('query', `artifact not found: ${id}`);
        return success('query', { artifact });

      case 'audit':
        if (!id) return failure('query', 'usage: qm query audit <artifact-id>');
        const compatibility = queryCompatibility(repo, id);
        if (!compatibility) return failure('query', `artifact not found: ${id}`);
        return success('query', compatibility);

      case 'status':
        const harness = id ?? first ?? 'claude-code';
        return success('query', queryDeployment(repo, harness));

      case 'scaffold':
        if (!id || !first) return failure('query', 'usage: qm query scaffold <type> <path>');
        try {
          return success('query', scaffoldArtifact(id as ArtifactType, first));
        } catch (err) {
          return failure('query', (err as Error).message);
        }

      default:
        return failure('query', 'usage: qm query list|search|get|audit|status|scaffold');
    }
  } finally {
    repo.close();
  }
}