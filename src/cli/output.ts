// ─────────────────────────────────────────────────────────────
// Quartermaster — CLI output contract & flag parsing
// Shared by every command. Guarantees a stable machine-readable
// envelope (NFR: agent query interface) and plain-language
// reasons on every refusal (NFR-050: never silently drop).
// ─────────────────────────────────────────────────────────────

/** Stable result envelope returned by every command. */
export interface OutputEnvelope<T = unknown> {
  ok: boolean;
  command: string;
  /** Present on success. */
  data?: T;
  /** Plain-language explanation; REQUIRED whenever ok === false. */
  reason?: string;
}

/** Exit codes used across the CLI. */
export const EXIT = {
  ok: 0,
  /** A command ran but refused / failed for a stated reason. */
  failure: 1,
  /** Usage error (unknown command, bad flags). */
  usage: 2,
  /** Command recognized but not yet implemented (tracked in tasks.md). */
  notImplemented: 3,
  /** Unexpected internal error. */
  internal: 4,
} as const;

export function success<T>(command: string, data: T): OutputEnvelope<T> {
  return { ok: true, command, data };
}

export function failure(command: string, reason: string): OutputEnvelope<never> {
  return { ok: false, command, reason };
}

/** Parsed CLI arguments: positional words plus global/typed flags. */
export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: {
    /** Boolean flags; `--flag=true` forms arrive as the strings 'true'/'1'. */
    json: boolean | string;
    verbose: boolean | string;
    help: boolean | string;
    version: boolean | string;
    yes: boolean | string;
    /** Any other --key or --key=value flag. */
    [key: string]: boolean | string;
  };
}

/**
 * Flags that take a value and accept `--flag <value>` space form.
 * Every flag a command handler reads as a string belongs here; a boolean
 * flag left in the space form would silently swallow the next argument.
 */
const VALUE_FLAGS = new Set([
  'capability',
  'categories',
  'function',
  'kind',
  'lifecycle',
  'note',
  'path',
  'pin',
  'port',
  'reason',
  'ref',
  'role',
  'root',
  'source',
  'subdir',
  'tag',
  'target',
  'text',
  'turns',
  'type',
]);

/**
 * Parse argv into a command, positional args, and flags.
 * Recognizes `--flag`, `--flag=value`, and short `-h`/`-v`.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: ParsedArgs['flags'] = {
    json: false,
    verbose: false,
    help: false,
    version: false,
    yes: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg === '-h') {
      flags.help = true;
    } else if (arg === '-v') {
      flags.version = true;
    } else if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq >= 0) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (VALUE_FLAGS.has(body)) {
        // Space form: --flag <value> consumes the next argv entry.
        const value = argv[i + 1];
        if (value === undefined || value.startsWith('-')) {
          throw new Error(`flag --${body} requires a value`);
        }
        flags[body] = value;
        i += 1;
      } else {
        flags[body] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  const command = positional.shift() ?? '';
  return { command, positional, flags };
}

/**
 * Render an envelope to stdout/stderr and return its exit code.
 * `--json` emits the raw envelope; otherwise a human-readable line.
 */
export function emit(envelope: OutputEnvelope, json: boolean): number {
  if (json) {
    console.log(JSON.stringify(envelope));
  } else if (envelope.ok) {
    if (envelope.data !== undefined) console.log(renderHuman(envelope.data));
  } else {
    console.error(`quartermaster: ${envelope.command}: ${envelope.reason ?? 'failed'}`);
  }
  return envelope.ok ? EXIT.ok : EXIT.failure;
}

function renderHuman(data: unknown): string {
  if (typeof data === 'string') return data;
  return JSON.stringify(data, null, 2);
}
