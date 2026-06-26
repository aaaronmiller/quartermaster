# Quartermaster

Quartermaster is a local-first Bun/TypeScript CLI for cataloging agent artifacts, auditing harness
compatibility, previewing reversible deployments, managing loadouts and guidance, and exposing
stable JSON query commands for coding agents.

## Install

```bash
bun install
```

## Common Commands

```bash
bun run qm scan --root tests/fixtures/library/mixed --json
bun run qm catalog --json
bun run qm audit --matrix --json
bun run qm deploy preview --harness claude-code --target-root /tmp/qm-target --json
bun run qm deploy apply --harness claude-code --target-root /tmp/qm-target --yes --json
bun run qm status --json
```

Agent-safe query commands:

```bash
bun run qm query artifacts --json
bun run qm query compatibility --artifact <artifact-id> --json
bun run qm query deployment --harness claude-code --json
```

Validation:

```bash
bun run typecheck
bun test
```
