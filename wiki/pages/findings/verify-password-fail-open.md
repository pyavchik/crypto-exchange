---
title: verifyPassword authenticated any password against a malformed stored hash (fail-open, not fail-closed)
type: finding
updated: 2026-09-16
sources: []
related: [[session-auth-model]], [[tech-stack]]
---

# verifyPassword authenticated any password against a malformed stored hash (fail-open, not fail-closed)

**Found:** Phase 2 code review (`.planning/phases/02-accounts/02-REVIEW.md`, CR-01), by executing the real module with `tsx`, not by reading alone.
**Status:** Fixed in commit `7e2d3da` (formatting follow-up `493ba19`). Regression tests in `api/src/lib/password.test.ts` confirmed to fail against the pre-fix code and pass against the fix.

## Symptom

`verifyPassword(password, encoded)` is supposed to fail closed on a corrupted `password_hash` record — the function's own comment said as much ("a corrupted stored string must reject here, not crash the caller"). It did not crash, but for one specific class of corruption it also did not reject: it **authenticated successfully for any password**, silently, with no error or log signal.

```
corrupted stored value: scrypt$16384$8$1$c040d8c85354a34b607ea346ea804b95$zzzznothex
verifyPassword("literally-anything-wrong", corrupted) => true
```

## Root cause

`api/src/lib/password.ts` decoded the stored hash's hex component with `Buffer.from(hashHex, "hex")`. Node's hex decoder is lenient: it never throws on invalid hex — it silently stops decoding at the first invalid byte pair, producing whatever it managed to decode (the empty buffer if the very first pair is bad):

```js
> Buffer.from("zz", "hex").length
0
```

The old code then derived the candidate key at `keylen = expected.length` (i.e. 0 for a garbage hex string) instead of a fixed length. Node's `scrypt` happily derives a zero-length key for `keylen: 0`, so `actual` was also a zero-length buffer. `timingSafeEqual(Buffer.alloc(0), Buffer.alloc(0))` returns `true` for two empty buffers, and the preceding `actual.length !== expected.length` guard didn't help — both were `0`, so it passed.

The bug was reachable only through a corrupted/hand-edited/future-migration-produced `password_hash` value, not through the live `POST /api/signup`/`POST /api/login` endpoints as they exist today (those only ever write `hashPassword()`'s own well-formed output) — but the password-verification primitive itself must fail closed regardless of how a record became corrupted, because a future code path (admin tooling, a password-reset feature, a storage-layer bug) writing or hand-editing that column is exactly the scenario this function exists to guard.

## Fix

`verifyPassword` now:
1. Rejects a `saltHex`/`hashHex` that isn't strictly hex, even-length (via `/^[0-9a-f]+$/i` + a parity check) **before** ever calling `Buffer.from` — closing the silent-truncation path at its source.
2. Requires the decoded salt/hash to be exactly `SALT_LEN` (16) / `KEY_LEN` (32) bytes, rejecting otherwise, rather than deriving the candidate key at whatever length happened to decode.
3. Bounds `N`/`r`/`p` (must be integers; `N` must be a power of two; all three capped generously above today's constants; `128 * N * r` must stay within scrypt's default `maxmem`) before ever calling `scrypt`, so a corrupted or hostile record can't hand it an absurd parameter set.

## Regression checks

`api/src/lib/password.test.ts` adds CR-01 cases, including the reviewer's exact repro (`verifyPassword("literally-anything-wrong", "scrypt$16384$8$1$<valid-salt-hex>$zzzznothex")` must resolve `false`), a truncated-to-empty hash, a wrong-length hash, a wrong-length salt, and tampered `N`/`r`/`p`. Two of these (the non-hex repro and the truncated-hash case) were verified to actually reproduce the fail-open bug: reverting `password.ts` to the pre-fix version while keeping the new tests made exactly those two fail (`expected true to be false`); the wrong-length and tampered-N/r/p cases pass under both old and new code (the old length-equality/scrypt-`maxmem` guards already happened to reject those particular inputs, just not via deliberate validation) and are retained as hardening/regression coverage for the new explicit bounds.

## Lessons

- `Buffer.from(str, "hex")` is not a validator — it silently truncates invalid hex instead of throwing. Any code that decodes an untrusted/persisted hex string and uses `.length` to drive a security-sensitive derivation must validate the string's format *before* decoding, not trust the decoded length.
- `timingSafeEqual` compares two empty buffers as equal. Any code path that can produce a zero-length "expected" value from untrusted input turns a length-equality check into a bypass, not a safety net.
- A parser's own explanatory comment ("must reject here, not crash the caller") can describe the intended property accurately while the code sitting right below it fails to deliver on the other half of the promise (reject vs. silently succeed) — a comment is not proof of correctness; this was only caught by executing the real code with a corrupted input, not by reading.
