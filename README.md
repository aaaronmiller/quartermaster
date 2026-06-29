---
date: 2026-06-29 06:00:00 PDT
ver: 0.1.0
author: codex
model: gpt-5
tags: [quartermaster, composition, cli, validation, optional]
---
# Quartermaster

Quartermaster manages a local library of agent artifacts and deploys compatible artifacts into configured harness profiles.

## Optional Composition

Composition validation is optional and disabled by default. It validates Noun/Verb/Adjective artifact chains before a composed run:

- Nouns and verbs connect through matching output/input labels.
- Cycles are rejected.
- Adjectives can attach only to artifacts marked `enhanceable`.

Enable it with config:

```json
{
  "composition": {
    "enabled": true
  }
}
```

Or for one command:

```bash
QM_COMPOSITION_ENABLED=true qm compose validate chain.json --json
```

When disabled, composition validation returns `ok: true`, `disabled: true`, and no issues. Core scan, audit, and deploy flows do not depend on composition.
