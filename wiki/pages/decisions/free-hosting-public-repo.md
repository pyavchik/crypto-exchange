---
title: Free hosting + public repository
type: decision
updated: 2026-09-15
sources: []
related: [[tech-stack]], [[foundation-skeleton-conventions]], [[project-overview]]
---

# Free hosting + public repository

**Status:** Accepted; public repository done in Phase 1 (`pyavchik/crypto-exchange`, D-12).
Hosting provider is pending Phase 7. Recorded in `.planning/PROJECT.md` Key Decisions row 7.

## Context

The project has a $0 budget and exists so reviewers can click through the live app and the QA
docs — both require the repo and eventually the deployment to be free and publicly reachable.

## Decision

- The GitHub repository is public from day one, not made public at ship time.
- No secrets are ever committed: `.env` is gitignored, `.env.example` is tracked, and a full
  history secret scan runs before the first push ([[foundation-skeleton-conventions]]).
- The hosting provider itself is not yet chosen. It must support a persistent SQLite volume, or
  the project switches to a free Postgres instance instead ([[tech-stack]]) — this is still
  open and will be decided during Phase 7 planning.

## Consequences

- All planning documents (`.planning/`) and the wiki's full history are public from Phase 1
  onward — nothing sensitive can ever land in either.
- The Phase 7 hosting choice is constrained by the SQLite decision: a provider without
  persistent-volume support forces a database switch instead of a simple deploy.
