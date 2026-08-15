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
  if (envelope.ok) return EXIT.ok;
  // Usage errors (explicit "usage:" prefix or unknown command) exit 2;
  // anything else is a domain failure (1).
  const reason = envelope.reason ?? '';
  return reason.startsWith('usage:') || reason.startsWith('unknown command') ? EXIT.usage : EXIT.failure;
}

/**
 * Render an envelope's data payload for a human terminal.
 *
 * Rule: summary first, then aligned rows; never dump raw JSON in human mode.
 * Known shapes are rendered explicitly; anything else degrades to key: value.
 */
function renderHuman(data: unknown): string {
  if (typeof data === 'string') return data;
  if (data === null || data === undefined) return '';
  if (typeof data !== 'object') return String(data);
  const o = data as Record<string, unknown>;

  // Artifact lists: list/search emit { count, artifacts }; query emits { artifacts }.
  if (Array.isArray(o.artifacts)) {
    const artifacts = o.artifacts as Array<Record<string, unknown>>;
    if (artifacts.length === 0) return '0 artifacts';
    const rows = artifacts.map((a) => {
      const name = String(a.name ?? '?');
      const type = String(a.type ?? '');
      const org = String(a.org_path ?? '');
      return `  ${name.padEnd(42)} ${type.padEnd(12)} ${org}`;
    });
    const total = typeof o.count === 'number' ? o.count : artifacts.length;
    return `${total} artifact(s):\n${rows.join('\n')}`;
  }

  // Deployment plan: dry-run or applied (only when a real plan is present).
  if ((o.mode === 'dry-run' || o.mode === 'applied') && (o.plan || o.plans)) return renderPlan(o);

  // Source-library plan: { operationId, operations: [{action, sourceId, link}], conflicts }.
  if (typeof o.operationId === 'string' && Array.isArray(o.operations)) {
    const rows = (o.operations as Array<Record<string, unknown>>).map(
      (op) => `  ${String(op.action).padEnd(9)} ${String(op.sourceId ?? '?').padEnd(24)} -> ${String(op.link ?? '')}`,
    );
    const conflicts = Array.isArray(o.conflicts) ? (o.conflicts as Array<Record<string, unknown>>) : [];
    const conflictLines = conflicts.map((c) => `  !! conflict ${String(c.sourceId ?? '?')}: ${String(c.reason ?? '')}`);
    const parts = [...rows, ...conflictLines];
    return `${o.operations.length} source link(s), ${conflicts.length} conflict(s):\n${parts.join('\n')}`;
  }

  // Rollback listing: { usage, deployments: [...] }.
  if (typeof o.usage === 'string' && Array.isArray(o.deployments)) {
    const rows = (o.deployments as Array<Record<string, unknown>>).map(
      (d) => `  ${String(d.id).padEnd(34)} ${String(d.harness).padEnd(14)} ${String(d.status).padEnd(10)} ${String(d.timestamp)}  (${String(d.operations ?? 0)} ops)`,
    );
    return `recent deployments (${rows.length}):\n${rows.join('\n')}\n  ${o.usage}`;
  }

  // Harness status.
  if (Array.isArray(o.deployed) || Array.isArray(o.orphaned)) return renderStatus(o);

  // Profile lists.
  if (Array.isArray(o.profiles)) {
    const rows = (o.profiles as Array<Record<string, unknown>>).map(
      (p) => `  ${String(p.id).padEnd(18)} ${String(p.name ?? p.id).padEnd(20)} ${String(p.guidanceFilename ?? '')}`,
    );
    return `${o.profiles.length} profile(s):\n${rows.join('\n')}`;
  }

  // Loadout lists: { loadouts: [{name, harnesses, artifacts, pipelines, active}] }.
  if (Array.isArray(o.loadouts)) {
    const rows = (o.loadouts as Array<Record<string, unknown>>).map((l) => {
      const artifacts = Array.isArray(l.artifacts) ? l.artifacts.length : 0;
      const pipelines = Array.isArray(l.pipelines) ? l.pipelines.length : 0;
      const harnesses = Array.isArray(l.harnesses) ? l.harnesses.length : 0;
      const active = l.active === true ? 'active' : 'inactive';
      return `  ${String(l.name ?? '?').padEnd(28)} ${String(artifacts).padStart(4)} artifacts, ${String(pipelines).padStart(3)} pipelines, ${String(harnesses).padStart(2)} harnesses  [${active}]`;
    });
    return `${o.loadouts.length} loadout(s):\n${rows.join('\n')}`;
  }

  // Single loadout: { loadout: { name, artifacts, pipelines, ... } }.
  if (o.loadout && typeof o.loadout === 'object') {
    const l = o.loadout as Record<string, unknown>;
    const artifacts = Array.isArray(l.artifacts) ? l.artifacts.length : 0;
    const pipelines = Array.isArray(l.pipelines) ? l.pipelines.length : 0;
    const active = l.active === true ? ' (active)' : '';
    return `loadout '${String(l.name ?? '?')}': ${artifacts} artifacts, ${pipelines} pipelines${active}`;
  }

  // Rendered guidance preview: { rendered: { content, sections } }.
  if (o.rendered && typeof o.rendered === 'object') {
    const r = o.rendered as Record<string, unknown>;
    if (typeof r.content === 'string') {
      const sections = Array.isArray(r.sections) ? r.sections.length : 0;
      return `rendered guidance (${sections} managed section(s)):\n${r.content}`;
    }
  }

  // Sync/currency report: { unchanged, ahead, updated, conflicts, pinned, errors }.
  if (Array.isArray(o.unchanged) && Array.isArray(o.conflicts)) {
    const counts = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]).length : 0);
    const summary = `${counts('unchanged')} unchanged, ${counts('ahead')} ahead, ${counts('updated')} updated, ${counts('conflicts')} conflicts, ${counts('pinned')} pinned, ${counts('errors')} errors`;
    const sections: string[] = [];
    for (const key of ['ahead', 'updated', 'conflicts', 'pinned', 'errors'] as const) {
      const arr = (o[key] ?? []) as unknown[];
      if (arr.length > 0) {
        sections.push(`  ${key}: ${arr.length} — ${JSON.stringify(arr.slice(0, 5))}${arr.length > 5 ? ' …' : ''}`);
      }
    }
    return sections.length > 0 ? `${summary}\n${sections.join('\n')}` : summary;
  }

  // Audit matrix: { artifacts, harnesses, summary: {deployable, transform, incompatible, total}, matrix }.
  if (o.summary && typeof o.summary === 'object' && Array.isArray(o.matrix)) {
    const s = o.summary as Record<string, unknown>;
    const harnesses = Array.isArray(o.harnesses) ? o.harnesses.length : 0;
    return `audit: ${String(s.deployable ?? 0)} deployable, ${String(s.transform ?? 0)} transform, ${String(s.incompatible ?? 0)} incompatible (${String(s.total ?? '?')} cells across ${harnesses} harnesses, ${String(o.artifacts ?? 0)} artifacts)`;
  }

  // Proposal lists: { proposals: [{id, type, status, rationale, createdAt}] }.
  if (Array.isArray(o.proposals)) {
    const rows = (o.proposals as Array<Record<string, unknown>>).map((p) => {
      const rationale = typeof p.rationale === 'string' ? p.rationale.slice(0, 60) : '';
      return `  ${String(p.id).padEnd(40)} ${String(p.type).padEnd(10)} ${String(p.status).padEnd(9)} ${rationale}`;
    });
    return `${o.proposals.length} proposal(s):\n${rows.join('\n') || '  (none)'}`;
  }

  // Pin/unpin confirmation: { artifact, pinnedRevision? | unpinned? }.
  if (typeof o.artifact === 'string' && (o.pinnedRevision !== undefined || o.unpinned === true)) {
    if (o.pinnedRevision !== undefined) return `pinned ${o.artifact} to ${String(o.pinnedRevision)}`;
    return `unpinned ${o.artifact}`;
  }

  return renderKV(o);
}

function renderKV(o: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(o)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      lines.push(value.length > 8 ? `${key}: ${value.length} item(s) (use --json for the full list)` : `${key}: ${JSON.stringify(value)}`);
    } else if (typeof value === 'object') {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    } else {
      lines.push(`${key}: ${String(value)}`);
    }
  }
  return lines.join('\n');
}

function renderPlan(o: Record<string, unknown>): string {
  const plansList = Array.isArray(o.plans) ? (o.plans as Array<Record<string, unknown>>) : [];
  const single = (o.plan ?? plansList[0]) as Record<string, unknown> | undefined;
  const plans = plansList.length > 0 ? plansList : single ? [single] : [];
  const parts: string[] = [];
  for (const p of plans) {
    const ops = (p.operations ?? []) as Array<Record<string, unknown>>;
    const excluded = (p.excluded ?? []) as Array<Record<string, unknown>>;
    const methods = new Map<string, number>();
    for (const op of ops) {
      const m = String(op.method ?? '?');
      methods.set(m, (methods.get(m) ?? 0) + 1);
    }
    const summary = ops.length > 0 ? `${ops.length} operation(s) (${[...methods].map(([m, n]) => `${m}: ${n}`).join(', ')})` : '0 operations';
    const lines = ops.map((op) => {
      const transform = op.transform ? `, transform=${op.transform}` : '';
      return `  + ${String(op.sourcePath)} -> ${String(op.targetPath)}  (${String(op.method)}${transform})`;
    });
    const exclLines = excluded.map((e) => `  - excluded: ${String(e.artifactId ?? '?')} — ${String(e.reason ?? '')}`);
    parts.push(`${summary}${excluded.length > 0 ? `, ${excluded.length} excluded` : ''}\n${[...lines, ...exclLines].join('\n')}`);
  }
  if (parts.length === 0) return 'no plan';
  const header = o.mode === 'dry-run' ? 'Dry-run plan (nothing applied). Re-run with --yes to apply:' : 'Applied:';
  return `${header}\n${parts.join('\n')}`;
}

function renderStatus(o: Record<string, unknown>): string {
  const deployed = (o.deployed ?? []) as Array<Record<string, unknown>>;
  const orphaned = (o.orphaned ?? []) as Array<Record<string, unknown>>;
  const lines: string[] = [];
  const cap = (list: unknown[], item: (v: Record<string, unknown>, i: number) => string) => {
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
      if (out.length >= 12) {
        out.push(`  … and ${list.length - out.length} more (use --json for all)`);
        break;
      }
      out.push(item(list[i] as Record<string, unknown>, i));
    }
    return out;
  };
  for (const d of cap(deployed, (d) => {
    const sync = d.inSync === true ? 'in-sync' : 'drifted';
    return `  ${sync === 'in-sync' ? 'ok' : '!!'} ${String(d.artifactId ?? '?')} -> ${String(d.targetPath)} (${String(d.method ?? '')}) [${sync}]`;
  })) lines.push(d);
  for (const or of cap(orphaned, (or) => {
    const path = typeof or === 'string' ? or : String((or as Record<string, unknown>).path ?? (or as Record<string, unknown>).targetPath ?? '?');
    return `  ?? orphaned: ${path}`;
  })) lines.push(or);
  if (lines.length === 0) return 'nothing deployed (no applied deployment recorded)';
  return `${deployed.length} deployed, ${orphaned.length} orphaned:\n${lines.join('\n')}`;
}
