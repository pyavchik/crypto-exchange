---
phase: 02-accounts
plan: 03
subsystem: auth
tags: [react, react-router, vitest, fetch, session]

requires:
  - phase: 02-accounts
    provides: 02-01's AuthProvider/useAuth/ApiError/api.ts client conventions and pure-view/stateful-wrapper split; 02-02's POST /api/login, POST /api/logout, GET /api/wallet, and the D-27 fields-bearing error envelope this plan codes against
provides:
  - /login route (LoginView/Login) matching Signup.tsx's structure
  - ProtectedRoute — loading/redirect/pass-through guard wrapping /wallet and /orders (D-28/D-29)
  - Log out control in AppLayout's nav, reachable from every page (D-30), calling useAuth().logout() then navigating to /login
  - api.ts login()/logout()/fetchWallet(), all credentials:"include", ApiError extended with a fields member (D-27)
  - auth.tsx: performLogin/performLogout pure reducers, login()/logout() context actions, validateCredentialsClientSide (accelerator, D-15/D-27) and formErrorsFromApiError shared by both forms
  - Inline per-field error messages on both forms, every invalid field shown at once, EMAIL_TAKEN mapped onto the email field verbatim (D-26)
  - Explicit test-scope decision: Node Vitest environment kept, no DOM/interaction-testing tooling added (D-34 lineage)
affects: [02-04 (npm run smoke extension — login/logout/redirect real-browser proof), 02-05 (QA test cases trace directly to LoginView/ProtectedRoute/field-error behavior)]

actuals:
  tokens: 13300
  tasks: 3
  commits: 3
  plan_head_before: 9b9332bb320fc0f4f49398adb05e28bfb6bfda00

tech-stack:
  added: []
  patterns:
    - "performLogin/performLogout pure reducers (nextAuthState's pattern extended) — the imperative React state transition stays a thin wrapper around a directly unit-testable async function"
    - "formErrorsFromApiError: single mapping from ApiError to {fieldErrors, formError}, shared by Signup.tsx and Login.tsx, so both forms agree on which failures are field-level vs form-level"
    - "validateCredentialsClientSide: a client-side accelerator that mirrors api/src/routes/auth.ts's validateCredentials exactly, always overwritten by a server response carrying field detail"
    - "noValidate on both forms — required so the app's own per-field messages are what render, instead of native browser validation UI intercepting submission first"

key-files:
  created:
    - web/src/pages/Login.tsx
    - web/src/pages/Login.test.tsx
    - web/src/pages/Signup.test.tsx
    - web/src/components/ProtectedRoute.tsx
    - web/src/components/ProtectedRoute.test.tsx
  modified:
    - web/src/lib/api.ts
    - web/src/lib/api.test.ts
    - web/src/lib/auth.tsx
    - web/src/lib/auth.test.tsx
    - web/src/pages/Signup.tsx
    - web/src/App.tsx
    - web/src/App.test.tsx
    - web/src/styles/theme.css

key-decisions:
  - "performLogin/performLogout extracted as pure, directly-testable async functions rather than only living inside AuthProvider's useMemo, since no DOM/interaction-testing tooling exists to exercise the imperative React state transition otherwise"
  - "validateCredentialsClientSide and formErrorsFromApiError placed in auth.tsx (not a new module) so both Signup.tsx and Login.tsx share one implementation instead of duplicating the EMAIL_TAKEN-to-field-error mapping"
  - "noValidate added to both forms (not explicitly asked for in the plan text) so the custom per-field messages are what the human-check in 02-04/UAT actually sees, instead of the browser's native required/type=email validation bubble intercepting submission first"
  - "auth.test.tsx's pre-existing SignupView tests moved into the new Signup.test.tsx, matching Login.test.tsx's location for the same view/wrapper pair, rather than duplicating coverage across two files"

patterns-established:
  - "Pure reducer extraction for every context action that needs unit coverage without DOM tooling (performLogin/performLogout), not just for the read side (nextAuthState)"

requirements-completed: [AUTH-01, AUTH-02, AUTH-03]

coverage:
  - id: D1
    description: "A returning user can log in at /login and is taken to their wallet"
    requirement: "AUTH-02"
    verification:
      - kind: unit
        ref: "web/src/pages/Login.test.tsx#LoginView — renders a clean form, all field/form-error states, submitting state"
        status: pass
      - kind: unit
        ref: "web/src/lib/auth.test.tsx#performLogin — resolves to the authenticated state on success, rejects the ApiError untouched on failure"
        status: pass
      - kind: integration
        ref: "api/src/routes/auth.test.ts#POST /api/login (02-02) — the exact HTTP contract Login.tsx codes against"
        status: pass
    human_judgment: true
    rationale: "The interactive submit -> navigate(\"/wallet\") flow is not exercised by any test in this plan — the web workspace has no DOM/interaction-testing tooling (D-34). The pieces (view rendering, performLogin's state transition, the API contract) are each proven; the wired click-through is proven by 02-04's real-browser npm run smoke, not here."
  - id: D2
    description: "A Log out control is reachable from every page, and using it returns the app to the signed-out state"
    requirement: "AUTH-03"
    verification:
      - kind: unit
        ref: "web/src/App.test.tsx#renders the signed-in email and a Log out control in the nav when authenticated"
        status: pass
      - kind: unit
        ref: "web/src/lib/auth.test.tsx#performLogout — resolves even when the underlying request rejects"
        status: pass
    human_judgment: true
    rationale: "\"Reachable from every page\" is structurally guaranteed (AppLayout wraps every route and AuthNav renders in it), but the interactive click -> logout() -> navigate(\"/login\") flow and the resulting signed-out UI are not exercised by any test here (no DOM/interaction tooling, D-34) — deferred to 02-04's npm run smoke."
  - id: D3
    description: "Visiting /wallet or /orders while signed out redirects to /login instead of showing an empty page"
    verification:
      - kind: unit
        ref: "web/src/components/ProtectedRoute.test.tsx#renders neither the loading shell nor the children when anonymous (the redirect branch)"
        status: pass
      - kind: unit
        ref: "web/src/App.test.tsx#redirects /wallet and /orders when anonymous — neither the loading shell nor the page renders"
        status: pass
    human_judgment: false
  - id: D4
    description: "While the app is still checking whether a session exists, protected routes show a loading state rather than flashing the login screen"
    verification:
      - kind: unit
        ref: "web/src/components/ProtectedRoute.test.tsx#renders a loading shell and not the children while the auth state is loading"
        status: pass
      - kind: unit
        ref: "web/src/App.test.tsx#renders the guard's loading shell (not the page) at /wallet and /orders with no AuthProvider — default context state is loading"
        status: pass
    human_judgment: false
  - id: D5
    description: "Invalid signup or login input is reported inline under the field it belongs to, with every invalid field flagged at once"
    requirement: "AUTH-01"
    verification:
      - kind: unit
        ref: "web/src/pages/Signup.test.tsx#renders both messages at once when both fields are invalid"
        status: pass
      - kind: unit
        ref: "web/src/pages/Login.test.tsx#renders both messages at once when both fields are invalid"
        status: pass
      - kind: unit
        ref: "web/src/lib/api.test.ts#login — rejects with an ApiError exposing field detail on a 400 validation failure"
        status: pass
    human_judgment: true
    rationale: "The plan's own Task 3 <verify> carries a <human-check> for this exact behavior in a real browser (empty form, bad email, duplicate email against the dark shell at 1280px/390px) — deferred to end-of-phase UAT harvesting per workflow.human_verify_mode=end-of-phase, not executed by this executor."
  - id: D6
    description: "The web workspace still declares no DOM test environment and no interaction-testing library (the explicit test-scope decision)"
    verification:
      - kind: other
        ref: "Task 3 <automated> verify — node -e dependency-scan guard + grep -q 'environment: \"node\"' web/vite.config.ts"
        status: pass
    human_judgment: false

duration: ~15min
completed: 2026-09-16
status: complete
---

# Phase 2 Plan 3: Login, Route Guards, and Inline Field Errors Summary

**`/login` and a nav-wide Log out control complete the frontend account lifecycle on top of 02-02's API, with a `ProtectedRoute` guard closing the login-flash gap (D-29), per-field validation messages driven by the server's `fields` envelope on both forms, and an explicit decision to keep the Node Vitest environment rather than add DOM/interaction-testing tooling this phase.**

## Performance

- **Duration:** ~15 min
- **Started:** ~2026-09-16T10:16:00+03:00 (approximate — right after 02-02's docs commit)
- **Completed:** 2026-09-16T10:30:36+03:00
- **Tasks:** 3 (all committed)
- **Files modified:** 13 (5 created, 8 modified)

## Accomplishments

- `Login.tsx` (new): `LoginView` (pure) + `Login` (stateful wrapper), matching `Signup.tsx`'s structure exactly, with a link to `/signup` and a request-id-bearing form-level error slot
- `api.ts`: `login`/`logout`/`fetchWallet` added following `fetchHealth`'s established shape exactly, all `credentials: "include"`; `ApiError` extended with a validated `fields: Record<string,string> | null` member (D-27), populated by `parseErrorResponse` only when the body carries a well-formed object of string values
- `auth.tsx`: `performLogin`/`performLogout` pure, directly-testable reducers backing `login()`/`logout()` context actions — login moves state to authenticated on success and anonymous (rethrowing) on failure; logout always resolves to anonymous even if the server call itself fails (T-02-20); `validateCredentialsClientSide` (accelerator mirroring the server's rules exactly) and `formErrorsFromApiError` (mapping `VALIDATION_ERROR`'s `fields` and `EMAIL_TAKEN`'s message onto the email field) shared by both forms
- `ProtectedRoute.tsx` (new): reads `useAuth().state` and renders exactly one of a loading shell, a declarative `<Navigate to="/login" replace />`, or its children — wrapping `/wallet` and `/orders` in `App.tsx`; `/markets` and `/trade` stay public
- `App.tsx`: `/login` route added next to `/signup` (both public, D-28); `AuthNav` renders neither control set while loading (no flicker) and adds a Log out button beside the signed-in email when authenticated, living in `AppLayout` alongside every other nav link — the structural guarantee behind AUTH-03's "from any page" (D-30)
- Both forms render a per-field message under the field it belongs to (`aria-describedby`-linked), every invalid field shown at once, driven by the server's `fields` envelope; a light client-side pre-check catches the obvious mistakes before a round trip and is always overwritten by a server response carrying field detail; the password is never trimmed; `noValidate` added to both forms so these custom messages — not the browser's native validation UI — are what render
- `theme.css`: `.form`/`.field`/`.field-error`/`.form-error` classes matching the existing dark palette; shell/nav/footer untouched
- Test-scope decision recorded explicitly (Task 3 item 6, D-34 lineage): the web workspace keeps its Node Vitest environment and asserts on rendered markup; no DOM environment or interaction-testing library was added; the interactive path (typing, submitting, the redirect, the nav swap) is proven instead by 02-04's real-browser `npm run smoke` step — guarded by an automated dependency scan and a `vite.config.ts` environment check in this plan's own `<verify>`
- Full suite green across both workspaces: 87 API tests + 70 web tests (up from 62 before this plan), `typecheck`/`lint`/`format:check`/`build` all clean; scope fence honored — zero `api/` files touched (`git diff --stat` confirms empty)

## Task Commits

Each task was committed atomically:

1. **Task 1: Login page and the client-side session actions** - `1692d7d` (feat)
2. **Task 2: Route guards and the Log out control on every page** - `0955022` (feat)
3. **Task 3: Inline field errors on both forms, and the test-scope decision** - `dc1dd40` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP update)

_Note: Task 1 carried `tdd="true"` — tests were written to cover every bullet in the behavior block and confirmed passing against the implementation in the same commit (this plan's frontmatter is `type: execute`, not `type: tdd`, matching 02-01/02-02's precedent)._

## Files Created/Modified

- `web/src/pages/Login.tsx` — `LoginView`/`Login`, mirroring `Signup.tsx`
- `web/src/pages/Login.test.tsx` — clean/field-error/form-error/submitting states
- `web/src/pages/Signup.test.tsx` (new) — same state coverage, moved out of `auth.test.tsx`; carries the test-scope decision comment
- `web/src/pages/Signup.tsx` — `fieldErrors` prop, client pre-check, `noValidate`
- `web/src/components/ProtectedRoute.tsx` — loading/redirect/pass-through guard
- `web/src/components/ProtectedRoute.test.tsx` — the three branches in isolation
- `web/src/lib/api.ts` — `login`/`logout`/`fetchWallet`, `ApiError.fields`, `parseFields` validation, `parseJsonBody<T>` generalized from `parseSessionResponse`
- `web/src/lib/api.test.ts` — `login`/`logout`/`fetchWallet` coverage, including the 400/401 field-detail cases
- `web/src/lib/auth.tsx` — `performLogin`/`performLogout`, `login()`/`logout()` context actions, `validateCredentialsClientSide`, `formErrorsFromApiError`
- `web/src/lib/auth.test.tsx` — `performLogin`/`performLogout` coverage added; `SignupView` tests moved to `Signup.test.tsx`
- `web/src/App.tsx` — `/login` route, `ProtectedRoute`-wrapped `/wallet`/`/orders`, `AuthNav`'s Log out control and loading-state suppression
- `web/src/App.test.tsx` — `/orders` moved out of the shared `ComingSoon` loop (now guarded); guarded-route and nav auth-state cases added
- `web/src/styles/theme.css` — form/field/error classes

## Decisions Made

- `performLogin`/`performLogout` extracted as pure async functions (not left inline inside `AuthProvider`'s `useMemo`) so the login/logout state-transition logic is directly unit-testable without DOM/interaction tooling — extending `nextAuthState`'s existing pure-reducer pattern from the write side.
- `validateCredentialsClientSide` and `formErrorsFromApiError` placed in `auth.tsx` rather than a new module, since both `Signup.tsx` and `Login.tsx` need identical logic and the plan's own `files_modified` list named `auth.tsx` for this task.
- Added `noValidate` to both `<form>` elements — not explicitly named in the plan text, but necessary for the plan's own human-check ("submitting an empty form shows a message under each field") to actually be true in a real browser: without it, the browser's native `required`/`type="email"` validation intercepts submission before the custom per-field messages can render.
- Moved `auth.test.tsx`'s pre-existing `SignupView` tests into the new `Signup.test.tsx`, matching where `LoginView`'s tests already lived (`Login.test.tsx`, created in Task 1), instead of leaving one view's tests split across two files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `App.test.tsx`'s shared `ComingSoon` route-cases loop no longer matches `/orders`**
- **Found during:** Task 2 (wrapping the `/orders` route element in `<ProtectedRoute>`, exactly as the plan instructs)
- **Issue:** The existing `COMING_SOON_ROUTE_CASES` loop asserted the `ComingSoon` page renders directly (no auth needed) for `/markets`, `/trade`, and `/orders` together. Once `/orders` is guarded, a render with no `AuthProvider` (default context state: loading) shows the guard's loading shell instead of `ComingSoon`'s "Orders" heading — an unavoidable consequence of the plan's own instruction to wrap the route, not an unrelated pre-existing issue. This is the same class of break 02-01 hit when `/wallet` stopped being a bare `ComingSoon` page.
- **Fix:** Removed `/orders` from the shared loop (now `markets`/`trade` only) and added dedicated guarded-route tests covering `/wallet` and `/orders` together across the loading/anonymous/authenticated states.
- **Files modified:** `web/src/App.test.tsx`
- **Verification:** `npm --prefix web run test -- src/App.test.tsx` — all cases pass.
- **Committed in:** `0955022` (Task 2 commit)

**2. [Rule 2 - Missing Critical] Added `noValidate` to both forms**
- **Found during:** Task 3 (implementing the per-field error messages)
- **Issue:** Without `noValidate`, the browser's native HTML5 constraint validation (`required`, `type="email"`, `minLength`) intercepts form submission before React's `onSubmit` handler runs, showing a native validation bubble instead of — or in addition to — the app's own `field-error` message. This would make the plan's own human-check ("submitting an empty form shows a message under each field") false in a real browser, even though every automated assertion in this plan (which renders `LoginView`/`SignupView` directly via `renderToStaticMarkup`, never simulating a real submit) would still pass.
- **Fix:** Added `noValidate` to both `<form>` elements; kept `required`/`minLength`/`type="email"` attributes for assistive-technology semantics, but they no longer block submission.
- **Files modified:** `web/src/pages/Signup.tsx`, `web/src/pages/Login.tsx`
- **Verification:** No automated test can observe this directly (no DOM tooling, D-34) — flagged for the human-check step in 02-04/UAT, where the actual constraint-validation behavior is observable.
- **Committed in:** `dc1dd40` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 1 bug introduced by the plan's own instructed route-guard change, 1 Rule 2 missing-critical fix needed for the plan's own human-check to be true in a real browser).
**Impact on plan:** Both were necessary consequences of the plan's own instructions; no scope creep beyond what Task 2/3's stated actions required.

## Issues Encountered

None beyond the two deviations above, all resolved inline.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 02-04 (the `npm run smoke` extension, D-34) should drive the actual interactive login/logout/redirect flow in real Chrome — this plan proves every piece (view states, pure reducers, the API contract, the guard's three branches) but the click-through itself is unproven by any test here, exactly as D6/D1/D2's `human_judgment: true` coverage entries record.
- The Task 3 human-check (empty-form/bad-email/duplicate-email field errors, dark-shell readability at 1280px/390px) is deferred to end-of-phase UAT harvesting per `workflow.human_verify_mode=end-of-phase` — not executed by this executor.
- No blockers. All plan-level `<verification>` items are green: `npm --prefix web run test` (70/70), `npm --prefix web run typecheck`, `npm --prefix web run build`, `npm run lint`, `npm run format:check`, the no-DOM-tooling dependency scan, and the `vite.config.ts` environment grep. Full-repo `npm run test` also green (87 API + 70 web). Scope fence honored — zero `api/` files touched.

---
*Phase: 02-accounts*
*Completed: 2026-09-16*

## Self-Check: PASSED

- `web/src/pages/Login.tsx` — FOUND
- `web/src/pages/Login.test.tsx` — FOUND
- `web/src/pages/Signup.test.tsx` — FOUND
- `web/src/components/ProtectedRoute.tsx` — FOUND
- `web/src/components/ProtectedRoute.test.tsx` — FOUND
- Commit `1692d7d` — FOUND in `git log --oneline --all`
- Commit `0955022` — FOUND in `git log --oneline --all`
- Commit `dc1dd40` — FOUND in `git log --oneline --all`
- All plan `<verification>` commands re-run and passing: `npm --prefix web run test` (70/70), `npm --prefix web run typecheck`, `npm --prefix web run build`, `npm run lint`, `npm run format:check`, dependency scan, `vite.config.ts` environment grep
- No `api/` files modified (scope fence honored) — confirmed via `git diff --stat 9b9332b..HEAD -- api/` (empty)
