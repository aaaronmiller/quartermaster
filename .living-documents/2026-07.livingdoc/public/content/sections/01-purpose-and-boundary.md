---
id: purpose-and-boundary
title: Purpose and authority
updated: 2026-07-19
---

Quartermaster is the deterministic control plane for discovering, organizing,
evaluating, composing, and selectively deploying agent artifacts across
harnesses. Its job is to replace fragmented skill synchronization with a clean,
source-aware catalog and explicit loadouts while preserving provenance,
compatibility checks, dry-run review, local edits, and rollback.

The current authority chain is recorded in
`specs/001-quartermaster/research/spec-kit-source-map.md`. Current user
corrections govern, followed by the original requirements/design, constitution,
current specification/plan, and canonical task ledger. Archives and old
deployment directories are evidence, not authority.

This milestone is prelaunch only. Quartermaster may catalog canonical sources,
prepare source links, build loadouts, and produce dry-run plans. It must not
replace Agents/Skillshare, write to a harness target, or start its web/TUI server
without a separate cut-over instruction.
