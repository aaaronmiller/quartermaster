// ─────────────────────────────────────────────────────────────
// Quartermaster — CLI Entry Point & command dispatch
// Commands are registered in COMMANDS. FR tasks attach a `handler`
// as each command is implemented; until then a recognized command
// returns an honest "not implemented" envelope (never a fake success).
// ─────────────────────────────────────────────────────────────

import { allowlistCommand, auditCommand } from './commands/audit';
import { listCommand } from './commands/catalog';
import { composeCommand } from './commands/compose';
import { guidanceCommand } from './commands/guidance';
import { pipelineCommand } from './commands/pipeline';
import { configCommand } from './commands/config';
import { deployCommand, rollbackCommand } from './commands/deploy';
import { evalCommand } from './commands/eval';
import { importCommand } from './commands/import';
import { loadoutCommand } from './commands/loadout';
import { libraryCommand } from './commands/library';
import { mcpCommand } from './commands/mcp';
import { newCommand } from './commands/new';
import { profileCommand } from './commands/profile';
import { queryCommand } from './commands/query';
import { safetyCommand } from './commands/safety';
import { proposalCommand, proposeCommand } from './commands/proposal';
import { scanCommand } from './commands/scan';
import { statusCommand } from './commands/status';
import { pinCommand, syncCommand, unpinCommand } from './commands/sync';
import { tuiCommand } from './commands/tui';
import { webCommand } from './commands/web';
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
  list: { summary: 'List/filter catalog (by type, capability, source, path)', fr: 'FR-006', handler: listCommand },
  search: { summary: 'Free-text search the catalog', fr: 'FR-006', handler: listCommand },
  import: { summary: 'Import artifacts from a source', fr: 'FR-010..014', handler: importCommand },
  sync: { summary: 'Check or update upstreams', fr: 'FR-012..014', handler: syncCommand },
  pin: { summary: 'Pin an artifact to a revision', fr: 'FR-014', handler: pinCommand },
  unpin: { summary: 'Remove an artifact revision pin', fr: 'FR-014', handler: unpinCommand },
  audit: { summary: 'Print compatibility matrix and verdicts', fr: 'FR-030..034', handler: auditCommand },
  plan: { summary: 'Dry-run a deployment plan', fr: 'FR-040,045' },
  deploy: { summary: 'Apply a deployment plan', fr: 'FR-040..048', handler: deployCommand },
  rollback: { summary: 'Reverse a recorded deployment', fr: 'FR-046', handler: rollbackCommand },
  status: { summary: 'Show deployed artifacts and drift', fr: 'FR-060,061', handler: statusCommand },
  profile: { summary: 'Manage harness profiles', fr: 'FR-020..023', handler: profileCommand },
  new: { summary: 'Scaffold a self-authored artifact', fr: 'FR-050', handler: newCommand },
  compose: { summary: 'Validate optional artifact composition chains', fr: 'FR-080', handler: composeCommand },
  loadout: { summary: 'Manage loadouts', fr: 'FR-090..094', handler: loadoutCommand },
  library: { summary: 'Validate and prepare the provenance-linked source library', fr: 'FR-010..014', handler: libraryCommand },
  pipeline: { summary: 'Define and attach pipelines', fr: 'FR-110..113', handler: pipelineCommand },
  eval: { summary: 'Advisory grading, comparison, proposals', fr: 'FR-100..105', handler: evalCommand },
  proposal: { summary: 'Review agentic proposals', fr: 'FR-104,105', handler: proposalCommand },
  propose: { summary: 'Generate advisory proposals', fr: 'FR-105', handler: proposeCommand },
  guidance: { summary: 'Edit and deploy guidance files', fr: 'FR-120..122', handler: guidanceCommand },
  safety: { summary: 'Safety auditor management', fr: 'FR-140..142', handler: safetyCommand },
  allowlist: { summary: 'Manage the trusted safety allowlist', fr: 'FR-142', handler: allowlistCommand },
  query: { summary: 'Agent query interface (machine-readable)', fr: 'FR-130,131', handler: queryCommand },
  mcp: { summary: 'Optional MCP query server (CLI stays primary)', fr: 'FR-132', handler: mcpCommand },
  config: { summary: 'Get/set local configuration', fr: 'Phase 0 / config', handler: configCommand },
  tui: { summary: 'Launch terminal interface', fr: 'NFR-052', handler: tuiCommand },
  web: { summary: 'Serve local web interface', fr: 'NFR-052', handler: webCommand },
};

/** Per-command usage hints surfaced by `qm <command> --help`. */
const SUBCOMMANDS: Record<string, string[]> = {
  scan: ['<root> [--incremental]'],
  list: ['[--type <t>] [--capability <c>] [--source <id>] [--path <p>] [--text <q>]'],
  search: ['<text>'],
  import: ['<source> [--kind git|git_subdir|marketplace|local]'],
  sync: ['--check (report only) | --confirm (apply)'],
  pin: ['<artifact> <revision>'],
  unpin: ['<artifact>'],
  audit: ['override <artifact> <harness> --status --note', 'risk', 'safety <artifact>', 'threshold <n>', '(default) matrix'],
  plan: ['recognized but not yet implemented — use `qm deploy` (dry-run by default)'],
  deploy: ['<harness|group> [--scope <sel>] [--yes]', '--all [--scope <sel>] [--yes]'],
  rollback: ['<deploy-id>'],
  status: ['<harness>'],
  profile: ['list', 'show <id>', 'add <file>', 'edit <file>', 'validate <file-or-id>'],
  new: ['<type> <path> [--root <path>]', '(without --root, resolves the canonical first-party authoring root)'],
  compose: ['validate <chain.json>'],
  loadout: ['create', 'add', 'add-pipeline', 'remove', 'list', 'assign', 'copy', 'status'],
  library: ['validate [registry]', 'prepare [registry] [--yes]', 'rollback <record>'],
  pipeline: ['list', 'create', 'get', 'delete', 'validate', 'propose [--instruction ...]', 'templates'],
  eval: ['config', 'grade <artifact> --categories <csv>', 'compare <a> <b> ...', 'investigate <artifact> --turns N'],
  proposal: ['list', 'accept <id>', 'reject <id> <reason>', 'edit <id> <json>'],
  propose: ['loadouts'],
  guidance: ['<source-file> <harness> [--yes]'],
  safety: ['allowlist', 'allow <kind> <id> --reason', 'threshold <n>', 'override <id> --note', 'audit <artifact>'],
  allowlist: ['add', 'remove', 'list'],
  query: ['list-skills', 'search --capability <c>', 'get <id>', 'audit <id>', 'status <harness>', 'related <id>', 'scaffold <type> <path>'],
  mcp: ['status', 'serve'],
  config: ['get <key>', 'set <key> <value>', 'list', 'path'],
  tui: ['(launch terminal interface)'],
  web: ['(serve local web interface)'],
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
  --json           Machine-readable JSON output
  --yes            Apply without interactive confirmation
`);
}

function printCommandHelp(command: string, spec: CommandSpec, json: boolean): void {
  const subs = SUBCOMMANDS[command];
  if (json) {
    console.log(
      JSON.stringify({
        ok: true,
        command: 'help',
        data: { command, summary: spec.summary, fr: spec.fr, subcommands: subs ?? [] },
      }),
    );
    return;
  }
  const lines = [`\nQuartermaster — ${command}`, `\n  ${spec.summary}  [${spec.fr}]`, `\nUsage:\n  qm ${command} [options]`];
  if (subs) {
    lines.push(`  qm ${command} <subcommand> [options]\n\nSubcommands / forms:\n${subs.map((s) => `  ${s}`).join('\n')}`);
  }
  lines.push('\nGlobal flags:\n  --help, -h    Show this help\n  --json        Machine-readable JSON output\n  --yes         Apply without interactive confirmation');
  console.log(lines.join('\n'));
}

async function main(): Promise<void> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    // Usage mistakes (e.g. a value flag without a value) are user errors,
    // not internal failures: clean message, exit 2.
    const reason = err instanceof Error ? err.message : String(err);
    if (process.argv.includes('--json') || process.argv.includes('--json=true')) {
      console.log(JSON.stringify(failure('', reason)));
    } else {
      console.error(`quartermaster: ${reason}`);
    }
    process.exit(EXIT.usage);
  }
  const { command, flags } = parsed;
  // Accept boolean, `--json=true`, and `--json=1` forms uniformly.
  const json = flags.json === true || flags.json === 'true' || flags.json === '1';

  const spec = COMMANDS[command];

  // Global flags / no command.
  if (command === 'version' || flags.version) {
    printVersion(json);
    process.exit(EXIT.ok);
  }
  if (!command || command === 'help' || flags.help) {
    if (spec) {
      printCommandHelp(command, spec, json);
    } else {
      printHelp(json);
    }
    process.exit(EXIT.ok);
  }

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
