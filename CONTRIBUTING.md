# Contributing to Quartermaster

## The gate — no checkmark without evidence

`specs/001-quartermaster/tasks.md` is the canonical task list. A task is marked
`[x]` **only** when both are true:

1. its named file exists, and
2. its `Verify:` signal passes — a command that exits 0, an observable behavior,
   or a green test.

If you cannot produce the evidence, the task stays `[ ]` (or `[~]` if in progress).
Never mark a task done because it "looks done." The previous task list was marked
complete with no working code; this rule exists to prevent a repeat.

## Local gates (run before marking anything done)

```bash
bun run build        # compiles the CLI
bun run typecheck    # src/ must be 0 errors (tsconfig.src.json)
bun run lint         # Biome on src/ (warnings non-blocking)
bun test             # test suite
```

- `bun run typecheck:all` includes the test tree. It currently reports errors from
  tests written against the old module layout; each goes green as its FR test task
  repairs it. Do not scope-creep those repairs — fix a test when you reach its task.

## Conventions

- TypeScript + Bun. Path aliases: `@core/*`, `@storage/*`, `@cli/*`.
- Every CLI command returns the `OutputEnvelope` from `src/cli/output.ts` and supports
  `--json`. Every refusal carries a plain-language `reason` (NFR-050: never drop silently).
- The library is read-only with respect to the deploy engine (Constitution I, NFR-011).
- No credentials in plans, logs, or profiles (NFR-031).
- Run SPIKE tasks before the cluster they head; their decision docs live in
  `specs/001-quartermaster/design/`.
