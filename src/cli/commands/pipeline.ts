// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm pipeline` CLI command
// FR-110, FR-111, FR-112, FR-113: pipeline management
// ─────────────────────────────────────────────────────────────

import { loadConfig } from '@core/config/load';
import { PipelineManager } from '@core/pipelines/pipelines';
import { validatePipeline, validateAllPipelines } from '@core/pipelines/validate';
import { proposePipelines } from '@core/pipelines/propose';
import type { PipelineDefinition } from '@core/types';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export async function pipelineCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const [sub, name, first, second] = args.positional;
  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    switch (sub) {
      case 'list':
      case undefined:
        return success('pipeline', { pipelines: repo.queryRaw('SELECT name, artifacts, directives FROM pipelines') });

      case 'create':
        if (!name) return failure('pipeline', 'usage: qm pipeline create <name> <artifact-id>...');
        const artifacts = args.positional.slice(2);
        const pipeline: PipelineDefinition = {
          name,
          artifacts,
          directives: {},
        };
        const manager = new PipelineManager(repo);
        manager.create(pipeline);
        return success('pipeline', { pipeline });

      case 'get':
        if (!name) return failure('pipeline', 'usage: qm pipeline get <name>');
        const mgr = new PipelineManager(repo);
        const found = mgr.get(name);
        if (!found) return failure('pipeline', `pipeline not found: ${name}`);
        return success('pipeline', { pipeline: found });

      case 'delete':
        if (!name) return failure('pipeline', 'usage: qm pipeline delete <name>');
        const delMgr = new PipelineManager(repo);
        delMgr.delete(name);
        return success('pipeline', { deleted: name });

      case 'validate':
        const valMgr = new PipelineManager(repo);
        const toValidate = name ? valMgr.get(name) : null;
        if (name && !toValidate) return failure('pipeline', `pipeline not found: ${name}`);
        const result = name
          ? validatePipeline(repo, toValidate!, args.flags.composition === 'true')
          : validateAllPipelines(repo, args.flags.composition === 'true');
        return success('pipeline', result);

      case 'propose':
        return proposeHandler(args, repo, cfg);

      default:
        return failure('pipeline', 'usage: qm pipeline list|create|get|delete|validate|propose');
    }
  } catch (err) {
    return failure('pipeline', (err as Error).message);
  } finally {
    repo.close();
  }
}

async function proposeHandler(args: ParsedArgs, repo: Repository, cfg: ReturnType<typeof loadConfig>): Promise<OutputEnvelope> {
  const instruction = args.flags.instruction as string | undefined;
  try {
    const options: { instruction?: string } = {};
    if (instruction) options.instruction = instruction;
    const proposals = await proposePipelines(repo.listArtifacts(), cfg, options);
    return success('pipeline', { proposals });
  } catch (err) {
    return failure('pipeline', (err as Error).message);
  }
}