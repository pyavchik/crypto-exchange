# Raw source: Karpathy — LLM Wiki pattern

- URL: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Captured: 2026-09-15 (extracted via web fetch; summary, short quotes verbatim)

- LLMs incrementally build and maintain a persistent wiki instead of re-retrieving from raw documents per query; "the wiki is a persistent, compounding artifact".
- Three layers: **raw sources** (immutable, LLM reads never modifies), **the wiki** (LLM-generated markdown: summaries, entities, concepts, analyses — LLM owns it), **the schema** (e.g. CLAUDE.md defining structure, conventions, workflows; co-evolved by human and LLM).
- Operations: **Ingest** (read source, discuss, summarise, update entity/concept pages, cross-reference; one source may touch 10–15 pages), **Query** (search pages, answer with citations; valuable answers become pages), **Lint** (contradictions, staleness, orphans, missing cross-references).
- Maintenance files: `index.md` (content catalog by category, updated every ingest), `log.md` (append-only chronological record with parseable prefixes).
- Humans curate sources and ask questions; LLM does the bookkeeping.
- Deliberately abstract: structure and tooling are up to the domain. Optional tools: Obsidian, Web Clipper, Marp, Dataview. The wiki is just a git repo of markdown.
