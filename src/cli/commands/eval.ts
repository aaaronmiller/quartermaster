// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm eval`
// Advisory model-backed evaluation commands.
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { compareArtifacts } from '@core/evaluation/compare';
import { gradeArtifact } from '@core/evaluation/grade';
import { investigateArtifact } from '@core/evaluation/investigate';
import { loadConfig } from '@core/config/load';
import { redactSecrets } from '@core/config/secrets';
import { Repository } from '@storage/repository';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

export async function evalCommand(args: ParsedArgs): Promise<OutputEnvelope> {
  const [sub, first, second, third] = args.positional;
  if (sub === 'config') return evalConfigCommand(first, second, third);

  const cfg = loadConfig();
  const repo = new Repository({ dbPath: cfg.dbPath });
  try {
    if (sub === 'grade') {
      if (!first) return failure('eval', 'usage: qm eval grade <artifact> --categories=a,b');
      const artifact = repo.getArtifact(first);
      if (!artifact) return failure('eval', `artifact not found: ${first}`);
      const categories = typeof args.flags.categories === 'string' ? csv(args.flags.categories) : ['quality'];
      // `multi` mode reads the artifact body; `single` grades metadata alone.
      // The core supported both from the start, but the CLI never passed the
      // option, so every graded score was a judgement of the frontmatter and
      // never of the instructions the skill actually contains. `--deep` is the
      // mode a human means when they ask whether a skill is any good; the
      // metadata-only pass stays the default because it is the cheap one to
      // run across the whole catalogue.
      const deep = args.flags.deep === true || args.flags.mode === 'multi';
      return success('eval', await gradeArtifact(artifact, categories, cfg, { mode: deep ? 'multi' : 'single' }));
    }
    if (sub === 'compare') {
      const ids = args.positional.slice(1);
      const artifacts = ids.map((id) => repo.getArtifact(id));
      if (artifacts.some((artifact) => artifact === null)) {
        return failure('eval', 'one or more artifacts not found. Run `qm query list` to see available artifacts.');
      }
      const deepCompare = args.flags.deep === true || args.flags.mode === 'multi';
      return success(
        'eval',
        await compareArtifacts(artifacts.filter((artifact) => artifact !== null), cfg, {
          mode: deepCompare ? 'multi' : 'single',
        }),
      );
    }
    if (sub === 'investigate') {
      if (!first) return failure('eval', 'usage: qm eval investigate <artifact> --turns=N');
      const artifact = repo.getArtifact(first);
      if (!artifact) return failure('eval', `artifact not found: ${first}`);
      const turns = typeof args.flags.turns === 'string' ? Number(args.flags.turns) : 1;
      return success('eval', await investigateArtifact(artifact, cfg, turns));
    }
    return failure('eval', 'usage: qm eval config|grade|compare|investigate');
  } catch (err) {
    return failure('eval', (err as Error).message);
  } finally {
    repo.close();
  }
}

function evalConfigCommand(sub?: string, key?: string, value?: string): OutputEnvelope {
  if (sub === 'set') {
    if (!key || value === undefined) return failure('eval', 'usage: qm eval config set <key> <value>');
    const projectPath = `${process.cwd()}/quartermaster.json`;
    const current = existsSync(projectPath) ? JSON.parse(readFileSync(projectPath, 'utf8')) : {};
    current.eval = current.eval ?? {};
    if (key.startsWith('model.')) {
      current.eval.models = current.eval.models ?? {};
      current.eval.models[key.slice('model.'.length)] = value;
    } else {
      current.eval[key] = coerce(value);
    }
    writeFileSync(projectPath, `${JSON.stringify(current, null, 2)}\n`);
    return success('eval', { set: key, file: projectPath });
  }
  return success('eval', redactSecrets(loadConfig().eval));
}

function csv(raw: string): string[] {
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
}

function coerce(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
