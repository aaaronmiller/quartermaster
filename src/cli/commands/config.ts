// ─────────────────────────────────────────────────────────────
// Quartermaster — `qm config` command (get / set / list / path)
// Reads via the precedence loader; writes land in the project file.
// ─────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { ConfigError, loadConfig } from '@core/config/load';
import { redactSecrets } from '@core/config/secrets';
import { type OutputEnvelope, failure, success } from '../output';
import type { ParsedArgs } from '../output';

const PROJECT_FILE = 'quartermaster.json';

function getPath(obj: unknown, dotted: string): unknown {
  return dotted.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function setPath(obj: Record<string, unknown>, dotted: string, value: unknown): void {
  const keys = dotted.split('.');
  let cursor = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i] as string;
    if (typeof cursor[k] !== 'object' || cursor[k] === null) cursor[k] = {};
    cursor = cursor[k] as Record<string, unknown>;
  }
  cursor[keys[keys.length - 1] as string] = value;
}

/** Parse a CLI value string: JSON when possible, else raw string. */
function coerce(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function configCommand(args: ParsedArgs): OutputEnvelope {
  const [sub, key, value] = args.positional;
  const cwd = process.cwd();
  const projectPath = `${cwd}/${PROJECT_FILE}`;

  try {
    switch (sub) {
      case 'path': {
        return success('config', {
          project: existsSync(projectPath) ? projectPath : `${projectPath} (not created yet)`,
          global: `${process.env.HOME ?? '~'}/.config/quartermaster/config.json`,
        });
      }
      case 'list':
      case undefined: {
        return success('config', redactSecrets(loadConfig()));
      }
      case 'get': {
        if (!key) return failure('config', 'usage: qm config get <key>');
        const resolved = loadConfig();
        const found = getPath(resolved, key);
        if (found === undefined) return failure('config', `no config key '${key}'`);
        return success('config', redactSecrets({ [key]: found }));
      }
      case 'set': {
        if (!key || value === undefined) return failure('config', 'usage: qm config set <key> <value>');
        const existedBefore = existsSync(projectPath);
        const previousRaw = existedBefore ? readFileSync(projectPath, 'utf8') : null;
        const current = previousRaw
          ? (JSON.parse(previousRaw) as Record<string, unknown>)
          : {};
        setPath(current, key, coerce(value));

        // Write, then validate the fully-resolved config. If the write made
        // config invalid, roll the file back to its prior state (never leave
        // a corrupt config persisted).
        mkdirSync(dirname(projectPath), { recursive: true });
        writeFileSync(projectPath, `${JSON.stringify(current, null, 2)}\n`);
        try {
          loadConfig({ cwd });
        } catch (err) {
          if (existedBefore && previousRaw !== null) writeFileSync(projectPath, previousRaw);
          else rmSync(projectPath, { force: true });
          throw err;
        }
        return success('config', { set: key, file: projectPath });
      }
      default:
        return failure('config', `unknown subcommand '${sub}' (use get/set/list/path)`);
    }
  } catch (err) {
    if (err instanceof ConfigError) return failure('config', err.message);
    return failure('config', (err as Error).message);
  }
}
