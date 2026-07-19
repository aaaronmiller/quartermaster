---
id: intent-and-source-audit
title: User intent and source audit
updated: 2026-07-19
---

The CASS index was refreshed before the audit: 326 conversations and 52,031
messages were indexed. A Quartermaster search returned 54 candidate sessions.
The reproducible extractor retained raw evidence, a first-pass 19-prompt set,
and a human-reviewed seven-prompt historical corpus.

The historical directives consistently require real FR decomposition, canonical
task order, evidence before checkmarks, reliable handoff, honest rough-edge
audits, and a final comparison against original documentation. The current
2026-07-19 instructions add the provenance-linked source library, specialist
catalog, multi-axis classification, pipeline templates, relationship
suggestions, clean-baseline rule, and prelaunch boundary.

Authoritative artifacts:

- `specs/001-quartermaster/QUARTERMASTER-INSTRUCTIONS.md`
- `specs/001-quartermaster/research/spec-kit-source-map.md`
- `specs/001-quartermaster/research/quartermaster-user-prompts.raw.json`
- `specs/001-quartermaster/research/quartermaster-user-prompt-corpus.curated.md`
- `scripts/mine-quartermaster-intent.py`

The older aggregated-copy decision was superseded by the newer requirement to
link canonical source trees into a provenance-organized library. Existing
harness target directories remain audit evidence only.
