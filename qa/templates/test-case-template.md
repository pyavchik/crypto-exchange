# Test Cases — [Feature]

| Field | Value |
|-------|-------|
| **Feature** | [Feature name, e.g. Authentication] |
| **Area code** | [AUTH / MKT / WAL / TRD / ORD / etc.] |
| **Requirements covered** | [REQ-IDs, e.g. AUTH-01, AUTH-02] |
| **Last updated** | [YYYY-MM-DD] |

## Usage Notes

- One file per feature, stored at `qa/test-cases/<FEATURE>.md`.
- IDs follow `TC-AREA-NNN` (e.g. `TC-AUTH-001`) and are never reused, even if a test case is retired.
- Priority is P1, P2, or P3 (see `qa/TEST-PLAN.md` Priority section).
- Type is exactly one of: `positive`, `negative`, `boundary`, `security`, `UX`.
- For multi-step cases, separate steps inside the Steps cell with `<br>` (HTML line-break) tags so the table stays one row per test case.

## Test Cases

| ID | Title | Req | Preconditions | Steps | Expected | Priority | Type |
|----|-------|-----|----------------|-------|----------|----------|------|
| TC-AREA-001 | [Test case title] | [REQ-ID] | [Preconditions, e.g. "User is logged in"] | [Step 1]<br>[Step 2]<br>[Step 3] | [Expected result] | [P1/P2/P3] | [positive/negative/boundary/security/UX] |
