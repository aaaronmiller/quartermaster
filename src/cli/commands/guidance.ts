// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm guidance` CLI command
// FR-120, FR-121, FR-122: guidance file management
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '@core/config/load';
import { renderGuidance, harnessGuidanceFilename } from '@core/guidance/render';
import { PipelineManager } from '@core/pipelines/pipelines';
import { LoadoutManager } from '@core/loadouts/loadouts';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export function guidanceCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, harness, targetPath] = args.positional;

  if (sub === 'filename') {
    if (!harness) return failure('guidance', 'usage: qm guidance filename <harness>');
    return success('guidance', { filename: harnessGuidanceFilename(harness) });
  }

  if (sub === 'render') {
    if (!harness) return failure('guidance', 'usage: qm guidance render <harness>');
    return renderHandler(args);
  }

  return failure('guidance', 'usage: qm guidance filename|render <harness>');
}

function renderHandler(args: ParsedArgs): OutputEnvelope {
  const [sub, harness, targetPath] = args.positional;

  if (!harness) {
    return failure('guidance', 'usage: qm guidance render <harness>');
  }

  const tp = typeof targetPath === 'string' ? targetPath : '';

  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });

  try {
    const sourcePath = typeof args.flags.source === 'string' ? args.flags.source : null;
    const canonical = sourcePath
      ? readFileSync(sourcePath, 'utf8')
      : '# Default Guidance\n\nAdd your skills here.';

    // FR-121: prefer the directives of the harness's active loadout; fall back
    // to all defined pipelines when no loadout is active for the harness.
    const loadoutMgr = new LoadoutManager(repo);
    const activeDirectives = loadoutMgr.activePipelineDirectives(harness);
    const pipelineMgr = new PipelineManager(repo);
    const pipelineList = activeDirectives.length > 0 ? activeDirectives : (pipelineMgr.list() ?? []);

    const existingFileContent = tp ? readFileSync(tp, 'utf8') : '';

    const rendered = renderGuidance({
      canonical,
      pipelineDirectives: pipelineList,
      targetHarness: harness,
      existingFile: existingFileContent,
    });

    if (tp) {
      writeFileSync(tp, rendered.content);
      return success('guidance', { path: tp, sections: rendered.sections.length });
    }

    return success('guidance', { rendered });
  } catch (err) {
    return failure('guidance', (err as Error).message);
  } finally {
    repo.close();
  }
}