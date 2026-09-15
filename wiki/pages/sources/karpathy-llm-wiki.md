---
title: Karpathy LLM Wiki gist
type: source
updated: 2026-09-15
sources: [raw/2026-09-15-karpathy-llm-wiki.md]
related: [[project-overview]]
---

# Karpathy LLM Wiki gist

Defines the memory pattern used here: raw sources → LLM-maintained wiki → schema, with `index.md` and
append-only `log.md`, and Ingest / Query / Lint operations. Our concrete conventions live in
`wiki/SCHEMA.md` (the gist is intentionally abstract). Division of labour with GSD: `.planning/` is
execution state, `wiki/` is durable knowledge.

Pages touched on ingest: [[project-overview]].
