# Quartermaster

Quartermaster is a local-first Bun/TypeScript CLI for cataloging agent artifacts, auditing harness
compatibility, previewing reversible deployments, managing loadouts and guidance, and exposing
stable JSON query commands for coding agents.

Loadouts and pipelines are represented as ordered pointers to cataloged skill files and related
artifacts. They can be assigned to harnesses so each CLI sees a focused active sequence instead of
the whole library.

## Install

```bash
bun install
```

## Common Commands

```bash
bun run qm scan --root tests/fixtures/library/mixed --json
bun run qm catalog --json
bun run qm audit --matrix --json
bun run qm loadout new coding --json
bun run qm loadout assign coding --harness claude-code --json
bun run qm pipeline new research-report --member <artifact-id> --directive "Use these skills in sequence." --json
bun run qm eval audit <artifact-id> --model "$QM_MODEL_NAME"
bun run qm eval improve <artifact-id> --model "$QM_MODEL_NAME"
bun run qm deploy preview --harness claude-code --target-root /tmp/qm-target --json
bun run qm deploy apply --harness claude-code --target-root /tmp/qm-target --yes --json
bun run qm tui
bun run qm web --port 4173
bun run qm status --json
```

LLM-backed audit and improvement uses an OpenAI-compatible endpoint. Configure
`QM_MODEL_NAME`, plus `QM_MODEL_API_KEY` or `OPENAI_API_KEY`; optionally set
`QM_MODEL_BASE_URL` for a non-default gateway.

Agent-safe query commands:

```bash
bun run qm query summary --json
bun run qm query artifacts --json
bun run qm query search deep --type skill --json
bun run qm query compatibility --artifact <artifact-id> --json
bun run qm query deployment --harness claude-code --json
bun run qm query loadouts --json
bun run qm query pipelines --json
bun run qm query proposals --json
```

Validation:

```bash
bun run typecheck
bun test
```
