---
phase: 01-foundation-project-memory
plan: 06
subsystem: infra
tags: [wiki, llm-wiki, lint, adr, documentation]

# Dependency graph
requires:
  - phase: 01-foundation-project-memory
    provides: "eslint.config.js flat config + Prettier gates from 01-02 (scripts/**/*.mjs already gets node globals, wiki/ already excluded from lint/format)"
provides:
  - "scripts/wiki-lint.mjs: dependency-free Node 24 ESM wiki LINT covering layers, page frontmatter/type, duplicate slugs, [[link]] resolution, CG-/email sensitive-data scan, index catalog coverage, log line format, and --base REV raw/log immutability"
  - "7 backfilled ADR pages in wiki/pages/decisions/ for PROJECT.md Key Decisions rows 1-7 (paper-trading-scope, limit-order-fill-model, tech-stack, coingecko-proxy, qa-first-class, llm-wiki-memory, free-hosting-public-repo)"
  - "wiki/index.md and .planning/PROJECT.md fully cross-linked: all 16 wiki pages catalogued, all 8 Key Decisions rows link to their ADR page"
  - ".claude/CLAUDE.md phase-transition rule naming the exact wiki-lint command"
affects: [01-07, 01-08]

# Actuals (#2632)
actuals:
  tokens: 8540
  tasks: 3
  commits: 3
  plan_head_before: effb703c556d608b35c985d3e49a15eb27dc9f8c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wiki LINT is dependency-free Node 24 ESM (node:fs, node:path, node:child_process only), invoked as `node scripts/wiki-lint.mjs [--pages-only] [--base REV]`"
    - "ADR backfill pattern: PROJECT.md Key Decisions row -> wiki/pages/decisions/<slug>.md (Context/Decision/Consequences, mirrors foundation-skeleton-conventions.md) -> wiki/index.md Decisions bullet -> PROJECT.md Rationale cell wiki link"

key-files:
  created:
    - scripts/wiki-lint.mjs
    - wiki/pages/decisions/paper-trading-scope.md
    - wiki/pages/decisions/limit-order-fill-model.md
    - wiki/pages/decisions/tech-stack.md
    - wiki/pages/decisions/coingecko-proxy.md
    - wiki/pages/decisions/qa-first-class.md
    - wiki/pages/decisions/llm-wiki-memory.md
    - wiki/pages/decisions/free-hosting-public-repo.md
  modified:
    - .claude/CLAUDE.md
    - wiki/index.md
    - wiki/log.md
    - .planning/PROJECT.md

key-decisions:
  - "wiki-lint.mjs scans [[slug]] links across each page's whole file content, including the frontmatter related: field, matching how existing pages (e.g. foundation-skeleton-conventions.md) already use double-bracket syntax there"
  - "tech-stack.md's related field omits a forward [[free-hosting-public-repo]] bracket-link (that page is created in Task 3, after tech-stack.md) to keep Task 2's broken_links=0 checkpoint honest; the relationship is described in prose instead, and free-hosting-public-repo.md links back to [[tech-stack]]"
  - "SENSITIVE and unverified checks scope to wiki/pages/**/*.md only (not wiki/index.md or wiki/log.md), matching SCHEMA.md's layer table definition of 'pages' as the LLM-owned layer"
  - "PAGE_BAD_DIR, INDEX_DEAD and INDEX_CATEGORY were added beyond the plan's minimum wording to make the lint genuinely load-bearing rather than a checklist that only checks what's explicitly named"

patterns-established:
  - "Every wiki-lint error line is `ERROR <CODE> <detail>`; the single deterministic summary line is `wiki-lint: pages=N orphans=N broken_links=N duplicates=N unverified=N errors=N`"
  - "--base REV enables provenance checks (RAW_MODIFIED, LOG_REWRITTEN) independent of --pages-only, since raw/log-history integrity is orthogonal to whether index/log-format checks run"

requirements-completed: [MEM-01, MEM-02, MEM-03, MEM-04]

coverage:
  - id: D1
    description: "scripts/wiki-lint.mjs is a deterministic, dependency-free checker that verifies MEM-01..03 on the wiki (layers, page frontmatter, duplicate slugs, broken [[links]], sensitive data, index coverage, log format) and enforces raw/log provenance via --base"
    requirement: "MEM-01"
    verification:
      - kind: other
        ref: "node scripts/wiki-lint.mjs --base e954363 (pages=16 orphans=0 broken_links=0 duplicates=0 errors=0)"
        status: pass
      - kind: other
        ref: "fail-first proof: scratch copy with a malformed wiki/log.md line — --pages-only exits 0, full run exits 1 on LOG_FORMAT"
        status: pass
      - kind: other
        ref: "npx eslint scripts/wiki-lint.mjs && npx prettier --check scripts/wiki-lint.mjs"
        status: pass
      - kind: other
        ref: "manual fault injection (reverted after each check): RAW_MODIFIED fires on a wiki/raw/ edit, LOG_REWRITTEN fires on rewriting an old wiki/log.md line, SENSITIVE fires on an injected CG- key and email address"
        status: pass
    human_judgment: false
  - id: D2
    description: "MEM-04: .claude/CLAUDE.md's phase-transition bullet names the exact wiki-lint command and still tells the agent to read wiki/index.md before planning a phase"
    requirement: "MEM-04"
    verification:
      - kind: other
        ref: "grep -q wiki-lint .claude/CLAUDE.md && grep -q wiki/index.md .claude/CLAUDE.md"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 7 Key Decisions (rows 1-7) have ADR pages in the SCHEMA.md decision format (frontmatter + Context/Decision/Consequences), catalogued exactly once each in wiki/index.md under ## Decisions in PROJECT.md table order, and linked from PROJECT.md's Rationale cells in row 8's existing style"
    requirement: "MEM-02"
    verification:
      - kind: other
        ref: "structural grep/awk checks: type: decision + ## Context/Decision/Consequences per page; index.md Decisions bullet order matches expected 8 slugs; grep -c wiki/pages/decisions/ .planning/PROJECT.md == 8; each page path appears exactly once in index.md"
        status: pass
    human_judgment: false
  - id: D4
    description: "The prose in each new ADR page accurately and concisely reflects its PROJECT.md Rationale/Outcome and the surrounding CONTEXT.md/REQUIREMENTS.md/wiki source material, and unverified claims correctly carry the (unverified) marker"
    verification: []
    human_judgment: true
    rationale: "Structural shape (frontmatter, sections, links) is machine-checked by wiki-lint, but whether the Context/Decision/Consequences prose is factually faithful and well-scoped is a judgment call reserved for the human read at phase transition, per the plan's own MEM-01 flagged assumption."
  - id: D5
    description: "wiki/log.md gained one DECISION line and one LINT line (with the real printed counts) via append only; the e954363 log content remains a byte-identical prefix of the current file"
    requirement: "MEM-03"
    verification:
      - kind: other
        ref: "tail -n 2 wiki/log.md shows DECISION then LINT; git diff e954363 -- wiki/log.md has zero removed (-) lines; wiki-lint --base e954363 LOG_REWRITTEN check passes"
        status: pass
    human_judgment: false

duration: ~25min
completed: 2026-09-15
status: complete
---

# Phase 1 Plan 6: Wiki LINT Automation and Key Decisions ADR Backfill Summary

**A dependency-free `scripts/wiki-lint.mjs` that machine-verifies MEM-01..03 (layers, links, index, log, raw/log provenance), plus 7 backfilled ADR pages giving every PROJECT.md Key Decision a wiki page.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-15 (approx.)
- **Completed:** 2026-09-15T18:10:41Z
- **Tasks:** 3
- **Files modified:** 8 created, 4 modified

## Accomplishments

- `scripts/wiki-lint.mjs`: a ~300-line, dependency-free Node 24 ESM checker with 8 check groups (layers, page frontmatter/type, duplicate slugs, `[[link]]` resolution, CG-/email sensitive-data scan, index catalog coverage — headings/orphans/duplicates/category/dead-links/empty-marker — log line format, and `--base REV` raw/log provenance), a deterministic one-line summary, and 14 distinct error codes
- Verified the checker against the pre-existing 9-page wiki: `pages=9 errors=0` with no wiki edits, proving the wiki was scaffolded correctly at init before any backfill began
- Demonstrated the checker is load-bearing, not decorative: a scratch-copy fail-first test (malformed `wiki/log.md` line) shows `--pages-only` still exits 0 while the full run exits 1 on `LOG_FORMAT`; manual fault injection (each reverted immediately after) confirmed `RAW_MODIFIED` fires on a `wiki/raw/` edit, `LOG_REWRITTEN` fires on rewriting an old log line, and `SENSITIVE` fires on an injected `CG-` key and email address — the three STRIDE mitigations (T-01-26/27/28) all actually trip
- `.claude/CLAUDE.md`'s "Project Memory — LLM Wiki" section (outside all GSD marker blocks) now names the exact phase-transition command: `node scripts/wiki-lint.mjs --base <rev>`
- Backfilled all 7 PROJECT.md Key Decisions (rows 1-7) as ADR pages in `wiki/pages/decisions/`, matching `foundation-skeleton-conventions.md`'s frontmatter + Context/Decision/Consequences format exactly, using real installed versions from `package-lock.json` for `tech-stack.md`
- `wiki/index.md`'s `## Decisions` section now lists all 8 decision pages (the pre-existing one first, the 7 new ones in PROJECT.md table order); every one of the 16 total wiki pages appears exactly once, under the correct heading
- `.planning/PROJECT.md` Key Decisions rows 1-7 each gained a `([wiki](../wiki/pages/decisions/SLUG.md))` link in their Rationale cell, in row 8's existing style — no decision text, outcome, or other section touched
- `wiki/log.md` gained one `DECISION` line (naming all 7 new pages + index) and one `LINT` line (the real counts from the post-backfill run: 16 pages, 0 orphans, 0 broken links, 5 unverified mentions), strictly appended — `git diff e954363 -- wiki/log.md` shows zero removed lines
- Final state: `node scripts/wiki-lint.mjs --base e954363` prints `pages=16 orphans=0 broken_links=0 duplicates=0 unverified=5 errors=0`

## Task Commits

Each task was committed atomically:

1. **Task 1: Scripted wiki LINT + CLAUDE.md phase-transition rule** — `bd8a349` (feat)
2. **Task 2: Backfill ADR pages for Key Decisions 1-5** — `729d50d` (feat)
3. **Task 3: Backfill Key Decisions 6-7, catalog, mirror links, log the backfill** — `203d087` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit hash in the orchestrator's completion report).

## Files Created/Modified

- `scripts/wiki-lint.mjs` — dependency-free wiki LINT (created)
- `wiki/pages/decisions/paper-trading-scope.md` — ADR for row 1 (created)
- `wiki/pages/decisions/limit-order-fill-model.md` — ADR for row 2 (created)
- `wiki/pages/decisions/tech-stack.md` — ADR for row 3 (created)
- `wiki/pages/decisions/coingecko-proxy.md` — ADR for row 4 (created)
- `wiki/pages/decisions/qa-first-class.md` — ADR for row 5 (created)
- `wiki/pages/decisions/llm-wiki-memory.md` — ADR for row 6 (created)
- `wiki/pages/decisions/free-hosting-public-repo.md` — ADR for row 7 (created)
- `.claude/CLAUDE.md` — phase-transition bullet now names the wiki-lint command (modified)
- `wiki/index.md` — 7 new Decisions bullets added, existing bullet kept first (modified)
- `.planning/PROJECT.md` — Key Decisions rows 1-7 gained wiki links (modified)
- `wiki/log.md` — appended DECISION + LINT lines (modified, append-only)

## Decisions Made

- **`[[slug]]` links are scanned across a page's entire file content, including the frontmatter `related:` field** — this matches how existing pages (e.g. `foundation-skeleton-conventions.md`) already write `related: [[slug]], [[slug]]` with real double-bracket syntax, so the checker treats that field as a real, checkable link list rather than free text.
- **`tech-stack.md`'s `related:` field does not bracket-link `free-hosting-public-repo`** even though the plan's prose lists it as a related page, because `free-hosting-public-repo.md` is created in Task 3, after `tech-stack.md` in Task 2 — bracketing it there would have made Task 2's own `broken_links=0` verification fail. The relationship is described in prose in `tech-stack.md`'s Consequences section instead, and `free-hosting-public-repo.md` links back to `[[tech-stack]]` (created after `tech-stack.md` exists, so no forward-reference issue on that side).
- **SENSITIVE and unverified-mention counting scope to `wiki/pages/**/*.md` only**, not `wiki/index.md` or `wiki/log.md` — SCHEMA.md's layer table calls `wiki/pages/` the "LLM-owned" page layer distinctly from the catalog (`index.md`) and log (`log.md`) layers, so "any page" and "across pages" in the plan's task text are read as that layer specifically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Avoided a self-inflicted broken link in `tech-stack.md`**
- **Found during:** Task 2, drafting `tech-stack.md`'s `related:` field
- **Issue:** The plan's Task 2 action text lists `tech-stack.md`'s related pages as "project-overview, foundation-skeleton-conventions, free-hosting-public-repo" — but `free-hosting-public-repo.md` is not created until Task 3. Writing it as a `[[free-hosting-public-repo]]` bracket-link in Task 2 would make that task's own required `node scripts/wiki-lint.mjs --pages-only` verification (`broken_links= other than 0` fails) fail, since the checker correctly scans the frontmatter's `related:` field for real links.
- **Fix:** Kept `related:` to the two pages that already exist (`project-overview`, `foundation-skeleton-conventions`) and mentioned the free-hosting-public-repo relationship in prose (Consequences section, referencing it by name in backticks) instead of as a live link. `free-hosting-public-repo.md`, created afterward in Task 3, links back to `[[tech-stack]]` normally.
- **Files modified:** `wiki/pages/decisions/tech-stack.md`
- **Verification:** `node scripts/wiki-lint.mjs --pages-only` after Task 2 reports `broken_links=0 errors=0`; final `node scripts/wiki-lint.mjs --base e954363` after Task 3 also reports `broken_links=0`.
- **Committed in:** `729d50d` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 Rule 1 bug — a link the plan's own literal wording would have made broken at the time it was written)
**Impact on plan:** The fix keeps every task's own verification gate honest instead of weakening the checker or skipping the cross-reference; no scope creep. All must-haves, artifacts and prohibitions from the plan are otherwise satisfied exactly as written.

## Issues Encountered

None beyond the deviation documented above.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. All 7 ADR pages are complete, real content (not placeholders); `scripts/wiki-lint.mjs` has no TODO/FIXME markers and every check described in the plan is implemented and exercised.

## Next Phase Readiness

- `wiki/` now has 16 pages, all catalogued, all linked, with a working repeatable LINT — every later phase's `.planning/PROJECT.md` Key Decisions gain the same wiki-link treatment going forward, and phase transitions have a concrete command to run (`node scripts/wiki-lint.mjs --base <prev-phase-end-commit>`).
- `scripts/wiki-lint.mjs` is a pure Node script with no new dependencies — nothing for later plans to install or configure.
- Plan 01-08 (per the plan's own edge-coverage notes) is the next and only other plan expected to touch `wiki/log.md` in this phase (a `LINT` append at phase close); no other wave-3 plan touches `wiki/`.
- The `free-hosting-public-repo.md` page explicitly leaves the hosting-provider choice open for Phase 7 planning, consistent with `STATE.md`'s existing blocker.

## Self-Check: PASSED

- `test -f scripts/wiki-lint.mjs && test -f wiki/pages/decisions/paper-trading-scope.md && test -f wiki/pages/decisions/limit-order-fill-model.md && test -f wiki/pages/decisions/tech-stack.md && test -f wiki/pages/decisions/coingecko-proxy.md && test -f wiki/pages/decisions/qa-first-class.md && test -f wiki/pages/decisions/llm-wiki-memory.md && test -f wiki/pages/decisions/free-hosting-public-repo.md` → all found
- `git log --oneline --all --grep="01-06"` → matches `203d087 feat(01-06): catalog all 7 Key Decision ADRs...`, `729d50d feat(01-06): backfill ADR pages for Key Decisions 1-5`, `bd8a349 feat(01-06): scripted wiki LINT + phase-transition rule in CLAUDE.md`
- Re-ran all `<acceptance_criteria>` for Task 1, Task 2 and Task 3 → all PASS (see command transcript in execution log)
- Re-ran plan-level `<verification>`: `node scripts/wiki-lint.mjs --base e954363` → `pages=16 orphans=0 broken_links=0 duplicates=0 unverified=5 errors=0`; decisions-ordering check → matches expected 8 slugs in order; `.claude/CLAUDE.md` contains the wiki-lint phase-transition rule
- `git status --short` → clean (no uncommitted changes, no stray untracked files)

---
*Phase: 01-foundation-project-memory*
*Completed: 2026-09-15*
