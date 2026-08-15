# Quartermaster agent interface contract

This document is the contract for programmatic (AI agent / script) consumers of
`qm`. Everything here is stable: treat it as a versioned API surface. If a
behavior contradicts this document, the document is the bug.

## Invocation

```
qm <command> [options] [--json]
```

- `--json` on every command emits exactly one JSON object on stdout: the
  envelope. Human-readable output (no `--json`) is for terminals only; never
  parse it.
- Human errors go to stderr. With `--json`, the envelope goes to stdout even on
  failure.
- Commands are non-interactive: nothing ever prompts, waits on a TTY, or reads
  stdin. `--yes` is the only confirmation gate, and it is explicit.
  (`qm tui` and `qm web` are interactive surfaces by design and are outside
  this contract.)

## Envelope

```json
{ "ok": true, "command": "scan", "data": { ... } }
{ "ok": false, "command": "query", "reason": "artifact not found: nope" }
```

- `ok: true` → `data` present, `reason` absent.
- `ok: false` → `reason` is a non-empty plain-language string; `data` absent.
- Unknown fields may be added; never removed. Consumers must ignore unknowns.
- `--json=true` and `--json=1` are accepted and behave identically to `--json`.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Ran successfully. With `--json`, per-item errors may appear inside `data` (e.g. `data.errors`) while the run still succeeds — inspect those, not just rc. |
| 1 | Command ran but refused or failed for a stated `reason`. |
| 2 | Usage error: unknown command, missing argument, or a value flag without a value. `reason` starts with `usage:` or `unknown command`. |
| 3 | Command recognized but not yet implemented. |
| 4 | Unexpected internal error. |

## Artifact references

`qm query get|audit|related <ref>` resolve `<ref>` in this exact order:

1. `skill://<name>` — scheme stripped, resolved as a name
2. `art_<id>` — internal id, then T291 migration alias
3. path form — exact catalog path or exact org path
4. bare name — exact case-insensitive match on `name`, org-path basename, or
   path basename

Ambiguity rule: if a name/org-path step matches more than one artifact, the
command fails (`ok:false`, exit 1) with a `reason` listing every candidate id —
never a silent arbitrary pick.

## Determinism

- `qm query list` / `list-skills` / `search` results are ordered by `name`
  ascending, then `id` ascending. Same query, same order, always.
- `qm query related` is ordered by score descending, then `artifactId`.
- Artifact records always include `id`, `type`, `name`, `org_path`, `path`,
  `hash`, `required_capabilities`, `risk_flags`, `source_id`.

## Query surface

| Subcommand | Purpose |
|---|---|
| `query list` | All catalog artifacts (name,id ordered) |
| `query list-skills` | Skill-typed artifacts only |
| `query search --text / --type / --capability` | Filtered search |
| `query get <ref>` | One artifact |
| `query audit <ref>` | Per-harness verdicts (`harness`, `status`, `reason`) |
| `query related <ref>` | Related artifacts with score + evidence |
| `query status <harness>` | Deployed state + drift |
| `query scaffold <type> <path>` | Create a stub (also honors the authoring root) |

## MCP parity

The optional MCP server (`qm mcp serve`, off by default) exposes the same query
operations through JSON-RPC 2.0 stdio. `list_skills`, `search`, `get`, `audit`
behave identically to the CLI, including ref resolution and ambiguity errors.

## Cron

`qm scan` and `qm sync` are safe to run unattended: no prompts, stable exit
codes, and per-item errors reported in `data` rather than as crashes. `qm sync`
never overwrites locally modified artifacts without `--confirm`.
