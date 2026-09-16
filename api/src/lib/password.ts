import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// promisify(scrypt) resolves to the 3-arg (no-options) overload only — the
// installed @types/node does not expose scrypt's options overload through a
// __promisify__ signature, so calling the promisified function with an
// options object fails to typecheck. A small explicit wrapper avoids that.
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * D-14: password hashing with Node's built-in crypto.scrypt. Parameters are
 * baked into the stored string (`scrypt$N$r$p$salt$hash`) so they can change
 * later without a migration. Node errors when `128 * N * r` exceeds the
 * 32 MiB default `maxmem` bound — these parameters need 16 MiB (128 * 16384 *
 * 8), so raising N later is the thing that would start throwing.
 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 32;
const SALT_LEN = 16;

// verifyPassword reads N/r/p back out of the stored string (see D-14 above),
// so a future hashPassword is free to raise them -- but a corrupted or
// hand-edited record must not be able to hand scrypt an absurd N/r/p. These
// bounds are generous headroom above today's SCRYPT_N/R/P (enough for a
// real future upgrade) while still rejecting hostile values before they
// ever reach scrypt: a large-enough N/r blows past Node's default maxmem
// (and throws) but only *after* burning real CPU/memory getting there, and
// N/r/p that are simply nonsensical (negative, fractional, not a power of
// two for N) have no reason to ever reach the scrypt call at all.
const MAX_SCRYPT_N = 2 ** 20; // 1,048,576 -- well above SCRYPT_N (2^14)
const MAX_SCRYPT_R = 64; // well above SCRYPT_R (8)
const MAX_SCRYPT_P = 16; // well above SCRYPT_P (1)
const SCRYPT_MAXMEM = 32 * 1024 * 1024; // Node's scrypt() default maxmem

// A stored hex component must be strictly hex, even-length hex -- anything
// else must be rejected before ever reaching Buffer.from, which silently
// truncates invalid hex instead of throwing (see verifyPassword below).
const HEX_RE = /^[0-9a-f]+$/i;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derivedKey = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("hex")}$${derivedKey.toString("hex")}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (
    !Number.isInteger(N) ||
    N < 2 ||
    (N & (N - 1)) !== 0 ||
    N > MAX_SCRYPT_N ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > MAX_SCRYPT_R ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > MAX_SCRYPT_P ||
    128 * N * r > SCRYPT_MAXMEM
  ) {
    return false;
  }
  // Buffer.from(str, "hex") never throws on invalid input -- it silently
  // stops decoding at the first invalid byte pair (returning the empty
  // buffer if the very first pair is bad), instead of throwing. A malformed
  // hex component must be rejected by strict pattern match *before* ever
  // calling Buffer.from, or a garbage hashHex/saltHex can decode to a
  // zero-length (or otherwise wrong-length) buffer that later compares
  // equal to another zero/short-length buffer regardless of password.
  if (
    !saltHex ||
    !hashHex ||
    !HEX_RE.test(saltHex) ||
    !HEX_RE.test(hashHex) ||
    saltHex.length % 2 !== 0 ||
    hashHex.length % 2 !== 0
  ) {
    return false;
  }
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  // Require exact, fixed lengths (never derive at whatever length happened
  // to decode): a stored hash/salt that isn't exactly KEY_LEN/SALT_LEN
  // bytes is itself corruption and must reject here, not silently drive a
  // zero- or wrong-length scrypt derivation that can spuriously compare
  // equal in timingSafeEqual.
  if (salt.length !== SALT_LEN || expected.length !== KEY_LEN) return false;
  let actual: Buffer;
  try {
    actual = await scryptAsync(password, salt, KEY_LEN, { N, r, p });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
