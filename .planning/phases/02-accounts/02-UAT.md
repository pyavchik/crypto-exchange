---
status: complete
phase: 02-accounts
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md, 02-04-SUMMARY.md, 02-05-SUMMARY.md]
started: 2026-09-16T11:05:00Z
updated: 2026-09-16T11:20:00Z
---

## Current Test

[testing complete]

## Execution Notes

The user delegated this phase ("keep going, don't stop until phase 2 is done"), so Claude ran UAT rather than the user. This is an INDEPENDENT pass, deliberately separate from plan 02-05's QA run: it was written from the phase's success criteria without reusing 02-05's harness, and it re-tests the same behavior through a different route so a bug in the QA harness cannot hide a bug in the app.

- Driver: Playwright `channel: "chrome"` against installed Google Chrome (bundled Chromium cannot install on macOS 13), plus direct `fetch` calls for API-level cases.
- Stack: an isolated instance (API :3300, web :5374, scratch SQLite, `LOG_FILE=off`). The user's own `npm run dev` on :3000/:5173 was left running and untouched.
- Result: **15/15 checks passed**. Script: `scratchpad/uat/uat2.mjs`.
- Repo state at test time: all five plans committed, `npm test` (87 api + 70 web), typecheck, lint, format:check and wiki-lint green; `npm run smoke` passes including the full browser auth journey.

## Tests

### 1. Sign up lands on a funded wallet and the session survives a reload
expected: Signing up with a fresh email redirects to /wallet showing exactly 10,000 USDT; reloading keeps the user signed in; the session cookie is httpOnly (invisible to document.cookie) with SameSite set.
result: pass
evidence: "Wallet shows 'USDT 10000.00000000'; reload stayed on /wallet still funded; document.cookie was empty; cookie httpOnly=true sameSite=Lax path=/; no uncaught page errors during the journey."

### 2. Log out, guarded route, and log back in
expected: The Log out control is reachable from the page, logging out leaves the session dead, visiting /wallet while logged out redirects to /login, and logging back in returns to the funded wallet.
result: pass
evidence: "After Log out, a direct navigation to /wallet landed on /login; logging back in with the same credentials returned 'USDT 10000.00000000'."

### 3. Invalid and duplicate signups show clear errors
expected: A bad email and a short password produce inline per-field messages; signing up again with an existing email is rejected with an explicit message.
result: pass
evidence: "Inline: 'Enter a valid email address' and 'Password must be at least 8 characters'. Duplicate: 'That email is already registered' (D-26's deliberate asymmetry vs login's generic error)."

### 4. Server-side isolation and error semantics (AUTH-04)
expected: Two accounts see only their own data; an unauthenticated wallet request returns 401 in the D-09 error envelope; a forged session token is rejected; login reveals nothing about which emails exist; logout invalidates the session server-side.
result: pass
evidence: "Two sessions returned their own distinct emails from /api/me. /api/wallet with no cookie -> 401 code=UNAUTHENTICATED with a requestId present. Forged 'session=deadbeef...' -> 401. Wrong password on a known email and on an unknown email both returned 401 'Invalid email or password' (timing 48ms vs 42ms — no usable signal). After POST /api/logout, reusing the same cookie on /api/me returned 401."

## Summary

total: 4
passed: 4
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

## Notes for later phases

- No id-parameterized endpoint exists yet, so AUTH-04 is currently guaranteed structurally (identity comes only from the cookie, D-20/D-22). When Phases 4-5 add routes that take an order or trade id, real IDOR cases must be added there — the isolation proof in this phase does NOT cover that shape of attack.
- Login rate limiting is deliberately absent (D-31) and recorded as risk R-15 in qa/TEST-PLAN.md for Phase 6.
- Session lifetime is a 7-day absolute expiry with no sliding renewal (D-17), and password hashing is `crypto.scrypt` rather than argon2id (D-14). Both were orchestrator defaults marked [ASSUMED] in 02-CONTEXT.md, not user choices.
