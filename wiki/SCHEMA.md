# Wiki Schema

Project memory for the CoinGecko Paper Exchange, following Andrej Karpathy's **LLM Wiki** pattern
(https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the wiki is a persistent,
compounding artifact maintained by the LLM, so knowledge is not re-derived every session.

## Layers

| Layer | Path | Owner | Rule |
|-------|------|-------|------|
| Raw sources | `wiki/raw/` | Human curates | Immutable. Never edit after adding; add a new file instead. |
| Wiki pages | `wiki/pages/` | LLM | LLM creates, updates, cross-links. Humans may read/comment. |
| Schema | `wiki/SCHEMA.md` | Human + LLM | Conventions below; co-evolves. |
| Catalog | `wiki/index.md` | LLM | Every page listed by category. Updated on every ingest. |
| Log | `wiki/log.md` | LLM | Append-only. Never rewrite past entries. |

Relationship to GSD: `.planning/` holds **execution state** (what to do next, plans, progress).
`wiki/` holds **durable knowledge** (what we learned, why, domain facts). Don't duplicate — link.

## Page types (`wiki/pages/<type>/<slug>.md`)

- `sources/` — one summary per raw source (what it says, takeaways, which pages it touched)
- `entities/` — concrete things: APIs, services, libraries, tools (e.g. `coingecko-api`)
- `concepts/` — domain/testing ideas: order rules, P&L method, rate limiting, test strategy
- `decisions/` — ADR-style records: context, decision, consequences, status
- `findings/` — things discovered while building/testing: bugs, gotchas, RCA summaries

## Page format

```markdown
---
title: <Title>
type: source | entity | concept | decision | finding
updated: YYYY-MM-DD
sources: [raw/<file>, ...]
related: [[<slug>]], [[<slug>]]
---

# <Title>

<content — concise, factual; mark unverified claims with "(unverified)">
```

- Link pages with `[[slug]]` (filename without `.md`).
- Cite raw sources for factual claims.
- Prefer updating an existing page over creating a near-duplicate.

## Operations

**INGEST** (new raw source):
1. Save it to `wiki/raw/YYYY-MM-DD-<slug>.md` with URL and capture date.
2. Write `pages/sources/<slug>.md`.
3. Create/update affected entity, concept and decision pages; add cross-links.
4. Update `index.md`. Append `INGEST` line to `log.md`.

**QUERY** (question answered from the wiki):
1. Read `index.md`, then relevant pages; answer with page citations.
2. If the answer is reusable, save it as a new page. Append `QUERY` line to `log.md`.

**LINT** (at every GSD phase transition, or on request):
1. Check for contradictions, stale facts, orphan pages (not in index / no inbound links), broken `[[links]]`.
2. Fix or flag. Append `LINT` line to `log.md` with counts.

**DECISION / FINDING** (during GSD execution):
- New key decision → `pages/decisions/` + mirror one line in `.planning/PROJECT.md` Key Decisions.
- Bug, gotcha or RCA → `pages/findings/` + link from the QA artifact in `qa/`.
- Append `DECISION` or `FINDING` line to `log.md`.

## Log line format

```
YYYY-MM-DD | INGEST|QUERY|LINT|DECISION|FINDING | <short summary> | <pages touched>
```
