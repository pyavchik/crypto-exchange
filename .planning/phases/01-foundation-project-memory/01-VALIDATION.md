---
phase: "1"
slug: "foundation-project-memory"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-09-15"
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.1 (`web` and `api` workspaces) |
| **Config file** | none — Wave 0 installs (`web/vitest.config.ts`, `api/vitest.config.ts`, or root `vitest.config.ts` with `test.projects`) |
| **Quick run command** | `npx vitest run <changed-file>.test.ts` |
| **Full suite command** | `npm test --workspaces --if-present` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed-file>.test.ts`
- **After every plan wave:** Run `npm test --workspaces --if-present`
- **Before `/gsd-verify-work`:** Full suite must be green (plus `npm run lint`, `npm run typecheck`)
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {N}-01-01 | 01 | 1 | REQ-{XX} | T-{N}-01 / — | {expected secure behavior or "N/A"} | unit | `{command}` | ✅ / ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `web/vitest.config.ts` + `api/vitest.config.ts` (or root config with `test.projects`) — framework config
- [ ] `api/src/routes/health.test.ts` — stubs for FND-03
- [ ] `api/src/plugins/request-id.test.ts` — stubs for FND-04
- [ ] `api/src/lib/logger.test.ts` — stubs for FND-04 (redaction, D-08)
- [ ] `eslint.config.js` + per-workspace `tsconfig.json` — FND-02 lint/typecheck gates
- [ ] Framework install: `vitest` devDependency for `web` and `api`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `npm run dev` boots web + api; page shows API health | FND-01 | Process orchestration + browser render | Run `npm run dev`, open web URL, confirm health status visible |
| CI green on GitHub | FND-02 | Requires push to GitHub remote | Push branch, confirm lint/typecheck/test jobs pass |
| Wiki structure, index, log, CLAUDE.md rules, ingests | MEM-01..04 | Document content review | Check files exist and follow `wiki/SCHEMA.md` |
| Test plan content | QA-01 | Document review | Confirm `qa/TEST-PLAN.md` covers scope, risks, severity/priority, entry/exit criteria |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
