// ─────────────────────────────────────────────────────────────
// Quartermaster — Configuration schema, defaults, and validation
// The single source of truth for every "configured/configurable"
// value the spec references: catalog roots, target harnesses,
// profile directory, eval endpoint/models, and safety threshold.
// Secrets are referenced by env-var NAME, never stored inline.
// ─────────────────────────────────────────────────────────────

/** Evaluation gateway configuration (FR-103, NFR-061). */
export interface EvalConfig {
  /** Provider/adapter identifier (e.g. 'openai-compatible', 'anthropic'). */
  provider: string;
  /** Base URL of the model endpoint. */
  baseUrl: string;
  /** Default model id used when a task does not specify one. */
  defaultModel: string;
  /** Per-task model overrides, e.g. { bulk: '...', deep: '...' }. */
  models: Record<string, string>;
  /** Name of the env var holding the API key — NOT the key itself (NFR-031). */
  apiKeyEnv: string;
  /** Maximum turns for multi-turn agentic runs (FR-102, NFR-062). */
  turnBudget: number;
}

/** Safety auditing configuration (FR-141, FR-142). */
export interface SafetyConfig {
  /** Deployment is gated below this score (0..1). */
  threshold: number;
  /** Trusted sources/plugins/skills exempt from repeat auditing. */
  allowlist: string[];
}

/** Optional composition validation module (FR-080). */
export interface CompositionConfig {
  /** Disabled modules must not block core deployment. */
  enabled: boolean;
}

/** The fully-resolved configuration object. */
export interface QuartermasterConfig {
  /** Library root locations to scan (FR-001). */
  roots: string[];
  /** SQLite catalog path. */
  dbPath: string;
  /** Directory holding custom harness profiles (FR-022). */
  profileDir: string;
  /** Active target harness names (FR-047). */
  harnesses: string[];
  /** Named groups of harnesses for group deploys (FR-047). */
  harnessGroups: Record<string, string[]>;
  safety: SafetyConfig;
  composition: CompositionConfig;
  eval: EvalConfig;
}

function home(): string {
  return process.env.HOME || process.env.USERPROFILE || '~';
}

/** Built-in defaults — the lowest layer of precedence. */
export function defaultConfig(): QuartermasterConfig {
  const h = home();
  return {
    roots: [`${h}/.quartermaster/library`],
    dbPath: `${h}/.quartermaster/catalog.db`,
    profileDir: `${h}/.quartermaster/profiles`,
    harnesses: [],
    harnessGroups: {},
    safety: { threshold: 0.6, allowlist: [] },
    composition: { enabled: false },
    eval: {
      provider: 'openai-compatible',
      baseUrl: '',
      defaultModel: '',
      models: {},
      apiKeyEnv: 'QM_EVAL_API_KEY',
      turnBudget: 8,
    },
  };
}

/** A single validation problem stated in plain language. */
export interface ConfigProblem {
  path: string;
  message: string;
}

/**
 * Validate a resolved config. Returns plain-language problems
 * (empty array = valid). Never throws.
 */
export function validateConfig(c: QuartermasterConfig): ConfigProblem[] {
  const problems: ConfigProblem[] = [];

  if (!Array.isArray(c.roots) || c.roots.some((r) => typeof r !== 'string')) {
    problems.push({ path: 'roots', message: 'roots must be a list of directory paths' });
  }
  if (typeof c.dbPath !== 'string' || c.dbPath.length === 0) {
    problems.push({ path: 'dbPath', message: 'dbPath must be a non-empty path' });
  }
  if (typeof c.profileDir !== 'string' || c.profileDir.length === 0) {
    problems.push({ path: 'profileDir', message: 'profileDir must be a non-empty path' });
  }
  if (!Array.isArray(c.harnesses)) {
    problems.push({ path: 'harnesses', message: 'harnesses must be a list of harness names' });
  }
  if (
    typeof c.safety?.threshold !== 'number' ||
    c.safety.threshold < 0 ||
    c.safety.threshold > 1
  ) {
    problems.push({
      path: 'safety.threshold',
      message: 'safety.threshold must be a number between 0 and 1',
    });
  }
  if (!Number.isInteger(c.eval?.turnBudget) || c.eval.turnBudget < 1) {
    problems.push({
      path: 'eval.turnBudget',
      message: 'eval.turnBudget must be a positive integer',
    });
  }
  if (typeof c.eval?.apiKeyEnv !== 'string' || c.eval.apiKeyEnv.length === 0) {
    problems.push({
      path: 'eval.apiKeyEnv',
      message: 'eval.apiKeyEnv must name the environment variable holding the API key',
    });
  }
  if (typeof c.composition?.enabled !== 'boolean') {
    problems.push({
      path: 'composition.enabled',
      message: 'composition.enabled must be true or false',
    });
  }

  return problems;
}
