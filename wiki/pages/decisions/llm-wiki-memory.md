---
title: LLM Wiki (Karpathy) for project memory
type: decision
updated: 2026-09-15
sources: [raw/2026-09-15-karpathy-llm-wiki.md]
related: [[karpathy-llm-wiki]], [[project-overview]]
---

# LLM Wiki (Karpathy) for project memory

**Status:** Accepted (project init, 2026-09-15). Recorded in `.planning/PROJECT.md` Key Decisions row
6.

## Context

A multi-phase, multi-session project needs durable knowledge that compounds instead of being
re-derived from scratch each session. Andrej Karpathy's LLM Wiki pattern
([[karpathy-llm-wiki]]) fits this directly and matches the user's stated preference.

## Decision

- `wiki/raw/` holds immutable raw sources; `wiki/pages/` is LLM-owned and cross-linked;
  `wiki/SCHEMA.md` documents the conventions both co-evolve under.
- `wiki/index.md` catalogs every page by category; `wiki/log.md` is append-only.
- Division of labour: `.planning/` (GSD) holds execution state — what to do next; `wiki/` holds
  durable knowledge — what was learned and why. Link between them, never duplicate.
- The LINT operation (contradictions, stale facts, orphans, broken links) is scripted as
  `node scripts/wiki-lint.mjs`, run at every phase transition.

## Consequences

- Every phase transition runs the LINT script and reads flagged pages, keeping the wiki
  trustworthy instead of silently drifting from the code.
- Key decisions are mirrored twice by convention: once as a `wiki/pages/decisions/` ADR page
  (the "why", with context and consequences) and once as a one-line row in
  `.planning/PROJECT.md` Key Decisions (the "what", for quick scanning).
