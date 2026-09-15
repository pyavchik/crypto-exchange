# BUG-NNN: [Short, specific title]

| Field | Value |
|-------|-------|
| **ID** | BUG-NNN |
| **Title** | [Short, specific title] |
| **Severity** | [S1 / S2 / S3 / S4 — per `qa/TEST-PLAN.md` Severity section] |
| **Priority** | [P1 / P2 / P3 — per `qa/TEST-PLAN.md` Priority section] |
| **Status** | [Open / In progress / Fixed / Retested / Closed / Won't fix] |
| **Environment** | [Local dev / CI / Production; browser + version; OS] |
| **Build commit** | [Short SHA — the `commit` value from `GET /health` at time of testing] |
| **Request ID** | [The `X-Request-Id` value from the failing response, if applicable] |
| **Linked test case** | [TC-AREA-NNN, if found while executing a test case] |
| **Linked requirement** | [REQ-ID this bug relates to, e.g. TRD-06] |
| **Found in run** | [RUN-YYYY-MM-DD-SCOPE, if found during a scripted execution run] |
| **Reporter** | [Name] |
| **Date** | [YYYY-MM-DD] |

## Summary

[One or two sentences describing the defect.]

## Steps to Reproduce

1. [Step one]
2. [Step two]
3. [Step three]

## Expected Result

[What should have happened.]

## Actual Result

[What actually happened.]

## Evidence

> Redact before posting — remove API keys, session cookies and Authorization headers from
> screenshots, HAR files and excerpts; this repository is public.

- Screenshot: [attach or link]
- Network excerpt: [request, response status, and the `X-Request-Id` header value]
- Log excerpt: [lines found by searching `api/logs/api.log` for the request ID]

## Impact

[Who/what is affected and how severely — trading correctness, security, cosmetic, etc.]

## Root Cause and Fix

[Optional. Link the RCA write-up and the regression test once the fix lands.]
