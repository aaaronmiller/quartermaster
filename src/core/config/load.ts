// ─────────────────────────────────────────────────────────────
// Quartermaster — Configuration loader
// Precedence (low → high): defaults < global file < project file < env.
// Pure-ish and injectable so precedence is deterministically testable.
// ─────────────────────────────────────────────────────────────

import { existsSync, readFileSync } from 'node:fs';
import {
  type ConfigProblem,
  type QuartermasterConfig,
  defaultConfig,
  validateConfig,
} from './schema';

export class ConfigError extends Error {
  constructor(
    message: string,
    public readonly problems?: ConfigProblem[],
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export interface LoadOptions {
  /** Project working directory (default: process.cwd()). */
  cwd?: string;
  /** Explicit global config path (default: ~/.config/quartermaster/config.json). */
  globalPath?: string;
  /** Explicit project config path (default: <cwd>/quartermaster.json or .qmrc). */
  projectPath?: string;
  /** Environment source (default: process.env). Injectable for tests. */
  env?: Record<string, string | undefined>;
  /** Base defaults (default: defaultConfig()). Injectable for tests. */
  defaults?: QuartermasterConfig;
}

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function home(): string {
  return process.env.HOME || process.env.USERPROFILE || '~';
}

/** Read + parse a JSON config file, or null if absent. Throws ConfigError on bad JSON. */
function readJsonFile(path: string): DeepPartial<QuartermasterConfig> | null {
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    throw new ConfigError(`cannot read config file ${path}: ${(err as Error).message}`);
  }
  try {
    return JSON.parse(raw) as DeepPartial<QuartermasterConfig>;
  } catch {
    throw new ConfigError(`config file ${path} is not valid JSON`);
  }
}

/** Merge `patch` over `base`. Plain objects merge deeply; arrays/scalars are replaced. */
function merge<T>(base: T, patch: DeepPartial<T> | null | undefined): T {
  if (!patch) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const prev = out[key];
    if (
      prev &&
      typeof prev === 'object' &&
      !Array.isArray(prev) &&
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      out[key] = merge(prev, value as DeepPartial<unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/** Translate QM_* environment variables into a config patch. */
function envPatch(env: Record<string, string | undefined>): DeepPartial<QuartermasterConfig> {
  const patch: DeepPartial<QuartermasterConfig> = {};
  const list = (v: string) => v.split(/[,:]/).map((s) => s.trim()).filter(Boolean);

  if (env.QM_ROOTS) patch.roots = list(env.QM_ROOTS);
  if (env.QM_DB_PATH) patch.dbPath = env.QM_DB_PATH;
  if (env.QM_PROFILE_DIR) patch.profileDir = env.QM_PROFILE_DIR;
  if (env.QM_HARNESSES) patch.harnesses = list(env.QM_HARNESSES);

  const safety: DeepPartial<QuartermasterConfig['safety']> = {};
  if (env.QM_SAFETY_THRESHOLD) safety.threshold = Number(env.QM_SAFETY_THRESHOLD);
  if (Object.keys(safety).length) patch.safety = safety;

  if (env.QM_COMPOSITION_ENABLED) {
    patch.composition = { enabled: env.QM_COMPOSITION_ENABLED === 'true' };
  }

  const ev: DeepPartial<QuartermasterConfig['eval']> = {};
  if (env.QM_EVAL_PROVIDER) ev.provider = env.QM_EVAL_PROVIDER;
  if (env.QM_EVAL_BASE_URL) ev.baseUrl = env.QM_EVAL_BASE_URL;
  if (env.QM_EVAL_MODEL) ev.defaultModel = env.QM_EVAL_MODEL;
  if (env.QM_EVAL_API_KEY_ENV) ev.apiKeyEnv = env.QM_EVAL_API_KEY_ENV;
  if (env.QM_EVAL_TURN_BUDGET) ev.turnBudget = Number(env.QM_EVAL_TURN_BUDGET);
  if (Object.keys(ev).length) patch.eval = ev;

  return patch;
}

/** Resolve the project config path: explicit, else quartermaster.json, else .qmrc. */
function resolveProjectPath(cwd: string, explicit?: string): string | null {
  if (explicit) return explicit;
  for (const name of ['quartermaster.json', '.qmrc']) {
    const candidate = `${cwd}/${name}`;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Load and validate configuration across all precedence layers.
 * Throws ConfigError (with plain-language problems) if the result is invalid.
 */
export function loadConfig(opts: LoadOptions = {}): QuartermasterConfig {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const globalPath = opts.globalPath ?? `${home()}/.config/quartermaster/config.json`;
  const projectPath = resolveProjectPath(cwd, opts.projectPath);

  let cfg = opts.defaults ?? defaultConfig();
  cfg = merge(cfg, readJsonFile(globalPath));
  if (projectPath) cfg = merge(cfg, readJsonFile(projectPath));
  cfg = merge(cfg, envPatch(env));

  const problems = validateConfig(cfg);
  if (problems.length > 0) {
    const summary = problems.map((p) => `  - ${p.path}: ${p.message}`).join('\n');
    throw new ConfigError(`invalid configuration:\n${summary}`, problems);
  }
  return cfg;
}
