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
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex ?? "", "hex");
    expected = Buffer.from(hashHex ?? "", "hex");
  } catch {
    return false;
  }
  // Derive at expected.length (never a hardcoded KEY_LEN): timingSafeEqual
  // throws on a byte-length mismatch instead of returning false, so a
  // corrupted stored string must reject here, not crash the caller.
  let actual: Buffer;
  try {
    actual = await scryptAsync(password, salt, expected.length, { N, r, p });
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
