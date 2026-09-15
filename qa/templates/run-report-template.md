# RUN-YYYY-MM-DD-SCOPE

| Field | Value |
|-------|-------|
| **Run ID** | RUN-YYYY-MM-DD-SCOPE |
| **Scope and phase** | [e.g. "Auth test cases — Phase 2"] |
| **Build commit** | [Short SHA] |
| **Environment** | URL: [ ] &nbsp;Browser + version: [ ] &nbsp;OS: [ ] &nbsp;API version (from `GET /health`): [ ] |
| **Tester** | [Name] |
| **Start date** | [YYYY-MM-DD] |
| **End date** | [YYYY-MM-DD] |

## Summary

| Result | Count |
|--------|-------|
| Pass | 0 |
| Fail | 0 |
| Blocked | 0 |
| Not run | 0 |
| Total | 0 |

## Results

| TC ID | Title | Result | Bug | Notes |
|-------|-------|--------|-----|-------|
| TC-AREA-001 | [Test case title] | [Pass / Fail / Blocked / Not run] | [BUG-NNN or —] | [Notes] |

## Bugs Raised

- [BUG-NNN — short title]

## Exit Criteria

Copied from `qa/TEST-PLAN.md` Exit Criteria — check off only what this run actually satisfies:

- [ ] All P1 test cases and at least 90% of P2 test cases executed
- [ ] 0 open S1 bugs and 0 open S2 bugs
- [ ] Every open S3/S4 bug has a filed bug report with a priority and a target phase
- [ ] This run report committed under `qa/runs/`
- [ ] Every requirement in the phase maps to at least one executed test case or one passing automated test
- [ ] CI is green on the commit this run was executed against

## Observations and Risks

[Anything noteworthy that isn't a filed bug — flaky behavior, near-misses, environment quirks.]

## Sign-off

[Tester name and date, confirming the results above are accurate.]
