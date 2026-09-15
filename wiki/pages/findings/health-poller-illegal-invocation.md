---
title: Health badge always shows "API unreachable" (setTimeout Illegal invocation)
type: finding
updated: 2026-09-15
sources: []
related: [[foundation-skeleton-conventions]], [[tech-stack]]
---

# Health badge always shows "API unreachable" (setTimeout Illegal invocation)

**Found:** Phase 1 UAT (`.planning/phases/01-foundation-project-memory/01-UAT.md`, tests 1-3), driven with Playwright against real Chrome.
**Status:** Open. Fix is planned as a Phase 1 gap-closure plan.

## Symptom

In a real browser the footer badge reads "API unreachable" even though every `GET /health` returns 200. After the API restarts, clicking Re-check never brings back "API ok", and the 60s poll never fires while the tab is visible.

## Root cause

`web/src/lib/healthPoller.ts` defaults `timers = { setTimeout, clearTimeout }` and calls `timers.setTimeout(...)`. That makes `this` the plain `timers` object. Browsers require `this` to be `window` for timer functions and throw `TypeError: Illegal invocation`. Node does not care, so the Vitest suite (Node environment) passes.

Sequence: fetch resolves -> `onUpdate({kind:"ok"})` -> `afterSettled()` -> `scheduleFromNow()` throws -> the `.catch` turns the TypeError into `onUpdate({kind:"error"})`. The badge flips to "API unreachable" and no next poll is scheduled.

Confirmed in Chrome by importing the real module and running it with a stub `fetchHealth`: states went `ok` -> `error: TypeError: Illegal invocation`.

## Lessons

- Unit tests running in a Node environment cannot catch browser-only host-object rules. Phase 1 had no real-browser check (`npm run smoke` hits the API, not a browser), so this reached UAT.
- Poller `.then` handlers catch their own bugs and report them as network errors. A programming error should not render as "API unreachable".
