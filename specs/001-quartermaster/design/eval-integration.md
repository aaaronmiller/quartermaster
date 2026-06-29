---
date: 2026-06-29 06:20:00 PDT
ver: 1.0.0
author: codex
model: gpt-5
tags: [quartermaster, eval, gateway, proposals, mock, advisory]
---
# Eval Integration

## Decision

Quartermaster evaluation uses a provider-agnostic, OpenAI-compatible HTTP transport by default. The endpoint, provider label, default model, per-task model overrides, API-key environment variable name, and turn budget come from `QuartermasterConfig.eval`.

## Adapter Contract

Input:

- `task`: behavior key such as `bulk`, `deep`, `grade`, `compare`, or `propose`.
- `messages`: chat-style `{role, content}` records.
- `config`: resolved Quartermaster config.

Output:

- `content`: model text.
- `model`: model actually used or requested fallback.
- `usage`: optional token counters.

The adapter detects response shape from the response itself. It accepts chat-completion content at `choices[0].message.content`, direct text at `output_text`, and direct `content` strings. Unknown shapes fail closed with a plain error.

## Credentials

Config stores only `eval.apiKeyEnv`. The gateway reads that environment variable at call time and never returns request headers, tokens, or raw environment values in public outputs.

## Model Selection

`resolveGatewayConfig(config, task)` chooses `config.eval.models[task]` first, then `config.eval.defaultModel`. This supports cheap bulk models and deeper models without hardcoded provider IDs.

## Turn Budget

Single-turn operations send one request. Investigation accepts a requested turn count and fails closed before model calls if it exceeds `config.eval.turnBudget`.

## Mock Strategy

Unit tests inject a mock `fetch` function into gateway calls. No live provider is required. Higher-level grade, compare, investigate, and proposal tests use deterministic JSON responses from the mock.

## Advisory Boundary

Evaluation results are saved as proposals only. They do not mutate loadouts, pipelines, deployments, or catalog state until `qm proposal accept <id>` is invoked. Accept/edit/reject are explicit lifecycle operations.
