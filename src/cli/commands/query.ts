// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm query` CLI command
// FR-130, FR-131: Agent query interface
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { queryArtifacts, queryArtifact, queryCompatibility, queryDeployment, queryRelated, querySearch, resolveArtifactRef, scaffoldArtifact } from '@core/query/commands';
import type { ArtifactType } from '@core/types';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function queryCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, id, first, _second] = args.positional;
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });

  try {
    switch (sub) {
      case 'list':
        return success('query', queryArtifacts(repo));
      case 'list-skills':
        return success('query', queryArtifacts(repo, { type: 'skill' }));

      case 'search': {
        const searchOpts: { text?: string; type?: string; capability?: string } = {};
        if (args.flags.text) searchOpts.text = args.flags.text as string;
        if (args.flags.type) searchOpts.type = args.flags.type as string;
        if (args.flags.capability) searchOpts.capability = args.flags.capability as string;
        return success('query', querySearch(repo, searchOpts));
      }

      case 'get': {
        if (!id) return failure('query', 'usage: qm query get <ref>  (id, skill://name, path, or name)');
        const resolved = resolveArtifactRef(repo, id);
        if ('error' in resolved) return failure('query', resolved.error);
        return success('query', { artifact: queryArtifact(repo, resolved.artifact.id) });
      }

      case 'audit': {
        if (!id) return failure('query', 'usage: qm query audit <ref>  (id, skill://name, path, or name)');
        const resolved = resolveArtifactRef(repo, id);
        if ('error' in resolved) return failure('query', resolved.error);
        const compatibility = queryCompatibility(repo, resolved.artifact.id);
        if (!compatibility) return failure('query', `artifact not found: ${id}`);
        return success('query', compatibility);
      }

      case 'status': {
        const harness = id ?? first ?? 'claude-code';
        return success('query', queryDeployment(repo, harness));
      }

      case 'related': {
        if (!id) return failure('query', 'usage: qm query related <ref>  (id, skill://name, path, or name)');
        const resolved = resolveArtifactRef(repo, id);
        if ('error' in resolved) return failure('query', resolved.error);
        const artifactId = resolved.artifact.id;
        return success('query', { artifactId, relationships: queryRelated(repo, artifactId) });
      }

      case 'scaffold':
        if (!id || !first) return failure('query', 'usage: qm query scaffold <type> <path>');
        try {
          return success('query', scaffoldArtifact(id as ArtifactType, first));
        } catch (err) {
          return failure('query', (err as Error).message);
        }

      default:
        return failure('query', 'usage: qm query list|search|get|audit|status|related|scaffold');
    }
  } finally {
    repo.close();
  }
}
