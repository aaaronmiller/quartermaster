# Model assignment

Which model for which role, what it costs, and what to fall back to when a
quota is hit.

**Derived 2026-08-25.** Prices from the live OpenRouter catalogue that day.
Intelligence scores are Artificial Analysis `intelligence_index` from the ARDF
snapshot of 2026-07-28 (`~/code/ardf/ardf/sources/attached-source-snapshots.json`,
533 models). Re-derive rather than trust after a month; catalogues move weekly
and a free model can stop being free without notice.

Two reference points the operator set, and everything here is measured against
them:

- **`muse-spark` scores 43.1** — the current default for general subagent work.
- **`mimo-v2.5` scores 40.1** — the floor. Nothing below this is acceptable.

## The finding that matters

**Three free models beat the paid default.**

| model | AA score | vs muse-spark 43.1 | ctx | verified |
| --- | --- | --- | --- | --- |
| `z-ai/glm-5.2:free` | **51.1** | **+8.0** | 256K | works |
| `minimax/minimax-m3:free` | **44.4** | **+1.3** | 1M | works |
| `stealth/ox-alpha` | not benchmarked | — | 1M | works |
| `minimax/minimax-m2.7:free` | 38.1 | −5.0 | 196K | works |
| `nvidia/nemotron-3-ultra-550b-a55b:free` | 37.8 | −5.3 | 1M | works |

`glm-5.2:free` at 51.1 outscores every paid model under the price ceiling, and
outscores `muse-spark` by 8 points. All four were exercised through
`omp -p --model openrouter/<id>` and returned correct output.

The two below the `mimo-v2.5` floor are listed because a rate-limited worker on
a 38-point model beats a blocked worker on a 51-point one. They are fallbacks,
not choices.

## Role assignment

### General subagent work — bulk, parallel, mechanical

1. `openrouter/z-ai/glm-5.2:free` — highest free score, 256K
2. `openrouter/minimax/minimax-m3:free` — 1M context, still above muse-spark
3. `opencode-go/muse-spark-1.2-contributor` — $0.10/$0.20, 1M, the paid baseline
4. `opencode-go/deepseek-ai/deepseek-v4-flash` — $0.083/$0.165, 1M, cheaper than muse

Start free. Fall through on quota, not on quality: 1 and 2 both beat the paid
option that follows them.

### Verification and high-IQ work

1. `openrouter/stealth/ox-alpha` — free, 1M context, the operator's designated
   verifier. Unscored because stealth models are not benchmarked, but it
   produced the sharpest analysis in this audit's head-to-head passes: it caught
   two contests the cheaper model had judged both ways.
2. `openrouter/z-ai/glm-5.2:free` — 51.1, the best *scored* free option
3. paid, under the $0.30 in / $0.50 out ceiling the operator set:

| model | in | out | ctx | AA |
| --- | --- | --- | --- | --- |
| `xiaomi/mimo-v2.5` | $0.14 | $0.28 | 1.05M | 40.1 |
| `meta/muse-spark-1.2-contributor` | $0.10 | $0.20 | 1M | 43.1 |
| `deepseek/deepseek-v4-flash` | $0.083 | $0.165 | 1M | 40.3 (max effort) |
| `qwen/qwen3.7-flash` | $0.03 | $0.13 | 1M | — |

Note `deepseek-v4-flash` is both cheaper and marginally better than
`mimo-v2.5` at max reasoning effort.

### Extra hands when workers are rate-limited

`openrouter/minimax/minimax-m2.7:free`, then
`openrouter/nvidia/nemotron-3-ultra-550b-a55b:free`, then
`opencode-go/deepseek-ai/deepseek-v4-flash`.

Both free options sit below the `mimo-v2.5` floor. Use them only to keep a
pipeline moving, never for verification.

## Reasoning effort

Set per use case, not globally:

| use case | effort | why |
| --- | --- | --- |
| mechanical extraction, classification, formatting | `low` / `minimal` | reasoning tokens buy nothing and cost latency |
| description grading, routine review | `medium` | the default |
| head-to-head judgement, adversarial verification | `high` / `xhigh` | measurably better: the shallow pass contradicted itself between batches, the deep pass did not |
| final gate on an irreversible decision | `max` | rare |

`deepseek-v4-flash` gains 11.6 points between non-reasoning (28.7) and
max-effort (40.3). Effort is not a minor dial on these models.

## Rate limits and concurrency

The operator's estimate — 50 API calls/min supports only 2–3 agents — matches
what was observed. A single agent doing tool-heavy work makes calls in bursts,
and two agents can saturate a 50/min bucket during a search-and-read phase.

Concurrency is bounded twice over, and the tighter bound wins:

- **API**: ~2–3 concurrent agents per provider quota
- **Memory**: measured on this 7 GB host — `jcode` 275–326 MB per session,
  `omp` 460–578 MB fresh (1,004 MB for an aged interactive session), `ante`
  679 MB because it wraps Claude Code. Eleven concurrent omp workers drove
  available memory to zero and 4 GB into swap.

Spreading roles across *different providers* raises the ceiling more than adding
workers on one: OpenRouter free, opencode-go, and opencode-zen have independent
quotas.

## OAuth reuse — what is available and what is not

Credentials present on this machine:

| credential | file | grants |
| --- | --- | --- |
| ChatGPT Plus | `~/.cli-proxy-api/codex-*-plus.json` | gpt-5.6-luna and siblings |
| Antigravity | `~/.cli-proxy-api/antigravity-*.json` | gemini-3.7-flash and opus-4.6, on **two separate quotas** |
| opencode / opencode-go / openrouter / ollama-cloud | `~/.local/share/opencode/auth.json` | API keys, usable directly |

The OAuth ones are usable from other harnesses **only through the local proxy
stack** — `_proxy_stack_auto_start` in `~/.zshrc`, which fronts them on
`127.0.0.1:8082/p/<name>`. That proxy was not running when this was written, so
none of those ports answered. Start it before assuming a gpt-5.6 or
gemini-3.7 route works; without it the OAuth models are reachable only through
their own CLI.

**Antigravity is the largest unexploited pool here**: two independent quotas on
strong models, and a working route to it doubles the concurrency ceiling
without spending anything.

Amazon models via a muse-cli OAuth key were not found — `~/.local/bin/` holds
only `.muse-release-info.json`, no credential. `meta/muse-spark-1.2-contributor`
is reachable through opencode-go and OpenRouter at $0.10/$0.20 regardless.

## Harness support

| harness | providers | note |
| --- | --- | --- |
| `omp` | opencode-go, opencode-zen, openrouter | `--model <provider>/<id>` |
| `jcode` | 30+, including opencode-go, openrouter, zai, groq, cerebras | `-p <provider>` |
| `ante` | Claude only | wraps the Claude CLI; `modelPool` selects *which Claude model*, not which provider |

**jcode's memory sidecar is the exception**: it accepts only OpenAI or Claude
models and rejects anything else with `Ignoring unsupported memory sidecar model
override '...'; expected an OpenAI or Claude model`. An unmerged implementation
exists — `alecuba16/jcode`, branch `feature/memory-sidecar-provider`, tracking
issue #679 — which adds `memory_sidecar_backend = auto|openai|claude|provider`.
Until that lands, the sidecar cannot run on a free model.
