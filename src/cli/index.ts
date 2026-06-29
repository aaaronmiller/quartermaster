// ─────────────────────────────────────────────────────────────
// Quartermaster — CLI Entry Point & command dispatch
// Commands are registered in COMMANDS. FR tasks attach a `handler`
// as each command is implemented; until then a recognized command
// returns an honest "not implemented" envelope (never a fake success).
// ─────────────────────────────────────────────────────────────

import { configCommand } from './commands/config';
import { scanCommand } from './commands/scan';
import { type OutputEnvelope, type ParsedArgs, EXIT, emit, failure, parseArgs } from './output';

const VERSION = '3.0.0';

type CommandHandler = (args: ParsedArgs) => Promise<OutputEnvelope> | OutputEnvelope;

interface CommandSpec {
  summary: string;
  /** Functional requirement(s) this command serves. */
  fr: string;
  /** Attached by the FR task that implements the command. */
  handler?: CommandHandler;
}

/** The command registry — single source of truth for dispatch and `--help`. */
const COMMANDS: Record<string, CommandSpec> = {
  scan: { summary: 'Scan library roots and update catalog', fr: 'FR-001..006', handler: scanCommand },
  import: { summary: 'Import artifacts from a source', fr: 'FR-010..014' },
  sync: { summary: 'Check or update upstreams', fr: 'FR-012..014' },
  audit: { summary: 'Print compatibility matrix and verdicts', fr: 'FR-030..034' },
  plan: { summary: 'Dry-run a deployment plan', fr: 'FR-040,045' },
  deploy: { summary: 'Apply a deployment plan', fr: 'FR-040..048' },
  rollback: { summary: 'Reverse a recorded deployment', fr: 'FR-046' },
  status: { summary: 'Show deployed artifacts and drift', fr: 'FR-060,061' },
  profile: { summary: 'Manage harness profiles', fr: 'FR-020..023' },
  new: { summary: 'Scaffold a self-authored artifact', fr: 'FR-050' },
  loadout: { summary: 'Manage loadouts', fr: 'FR-090..094' },
  pipeline: { summary: 'Define and attach pipelines', fr: 'FR-110..113' },
  eval: { summary: 'Advisory grading, comparison, proposals', fr: 'FR-100..105' },
  proposal: { summary: 'Review agentic proposals', fr: 'FR-104,105' },
  guidance: { summary: 'Edit and deploy guidance files', fr: 'FR-120..122' },
  safety: { summary: 'Safety auditor management', fr: 'FR-140..142' },
  query: { summary: 'Agent query interface (machine-readable)', fr: 'FR-130,131' },
  config: { summary: 'Get/set local configuration', fr: 'Phase 0 / config', handler: configCommand },
  tui: { summary: 'Launch terminal interface', fr: 'NFR-052' },
  web: { summary: 'Serve local web interface', fr: 'NFR-052' },
};

function printVersion(json: boolean): void {
  if (json) console.log(JSON.stringify({ ok: true, command: 'version', data: { version: VERSION } }));
  else console.log(`quartermaster v${VERSION}`);
}

function printHelp(json: boolean): void {
  if (json) {
    const commands = Object.fromEntries(
      Object.entries(COMMANDS).map(([name, spec]) => [name, spec.summary]),
    );
    console.log(JSON.stringify({ ok: true, command: 'help', data: { version: VERSION, commands } }));
    return;
  }
  const rows = Object.entries(COMMANDS)
    .map(([name, spec]) => `  ${name.padEnd(11)} ${spec.summary}`)
    .join('\n');
  console.log(`
Quartermaster — Multi-harness agent artifact manager (v${VERSION})

Usage:
  qm <command> [options]

Commands:
${rows}
  help        Show this help message

Global flags:
  --help, -h       Show help
  --version, -v    Print version
  --verbose        Detailed logging
  --json           Machine-readable JSON output
  --yes            Apply without interactive confirmation
`);
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  const { command, flags } = parsed;
  const json = flags.json === true;

  // Global flags / no command.
  if (!command || command === 'help' || flags.help) {
    printHelp(json);
    process.exit(EXIT.ok);
  }
  if (command === 'version' || flags.version) {
    printVersion(json);
    process.exit(EXIT.ok);
  }

  const spec = COMMANDS[command];

  // Unknown command → usage error.
  if (!spec) {
    const reason = `unknown command '${command}'. Run \`qm --help\` for usage.`;
    if (json) console.log(JSON.stringify(failure(command, reason)));
    else console.error(`quartermaster: ${reason}`);
    process.exit(EXIT.usage);
  }

  // Recognized but not yet wired → honest not-implemented (no fake success).
  if (!spec.handler) {
    const reason = `command '${command}' is recognized (${spec.fr}) but not yet implemented`;
    if (json) console.log(JSON.stringify({ ok: false, command, reason }));
    else console.error(`quartermaster: ${reason}`);
    process.exit(EXIT.notImplemented);
  }

  // Dispatch.
  try {
    const envelope = await spec.handler(parsed);
    process.exit(emit(envelope, json));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (json) console.log(JSON.stringify(failure(command, reason)));
    else console.error(`quartermaster: ${command}: ${reason}`);
    process.exit(EXIT.internal);
  }
}

main().catch((err) => {
  console.error('quartermaster: unexpected error:', err);
  process.exit(EXIT.internal);
});
