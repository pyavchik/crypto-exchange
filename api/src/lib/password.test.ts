import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies the same password that was hashed", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", encoded)).toBe(true);
  });

  it("rejects a different password", async () => {
    const encoded = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", encoded)).toBe(false);
  });

  it("produces a different stored string for two hashes of the same password (random salt)", async () => {
    const a = await hashPassword("password1");
    const b = await hashPassword("password1");
    expect(a).not.toBe(b);
    expect(await verifyPassword("password1", a)).toBe(true);
    expect(await verifyPassword("password1", b)).toBe(true);
  });

  it("rejects a malformed encoded string instead of throwing", async () => {
    await expect(verifyPassword("anything", "not-a-real-hash")).resolves.toBe(false);
  });

  it("rejects a stored hash with a byte-length different from the derived key without throwing", async () => {
    const encoded = await hashPassword("password1");
    const parts = encoded.split("$");
    // Widen the hash hex so its byte length no longer matches KEY_LEN.
    // verifyPassword must derive its candidate key at the stored hash's own
    // byte length (not a hardcoded KEY_LEN) and reject cleanly —
    // timingSafeEqual throws on a byte-length mismatch, which this pins down
    // as unreachable. scrypt's final extraction step is PBKDF2-style (output
    // built from independent hLen-byte blocks), so re-deriving at a LARGER
    // keylen with the same password/salt/N/r/p reproduces the original bytes
    // exactly and only appends new ones — appending a single fixed byte here
    // left a real 1-in-256 chance that the freshly derived extra byte
    // happened to match it, making this assertion flaky (observed failing
    // non-deterministically). Four fixed bytes appended instead drops the
    // coincidental-match probability to 1-in-2^32, cryptographically
    // negligible for a test run.
    const corrupted = [...parts.slice(0, 5), `${parts[5]}deadbeef`].join("$");
    await expect(verifyPassword("password1", corrupted)).resolves.toBe(false);
  });

  it("rejects a stored hash with a flipped byte (same length) without throwing", async () => {
    const encoded = await hashPassword("password1");
    const parts = encoded.split("$");
    const hashHex = parts[5] ?? "";
    const flippedLastByte = hashHex.slice(0, -2) + (hashHex.slice(-2) === "00" ? "01" : "00");
    const corrupted = [...parts.slice(0, 5), flippedLastByte].join("$");
    await expect(verifyPassword("password1", corrupted)).resolves.toBe(false);
  });

  // CR-01 regression: a malformed/non-hex stored hash component must fail
  // closed (verifyPassword -> false), never authenticate an arbitrary
  // password. Buffer.from(hex) silently decodes invalid hex to an empty (or
  // truncated) buffer instead of throwing, and prior to the CR-01 fix that
  // empty buffer made verifyPassword derive a zero-length key and compare
  // two empty buffers as equal -- authenticating *any* password.
  it("CR-01: rejects a non-hex stored hash instead of authenticating any password (reviewer's exact repro)", async () => {
    const encoded = await hashPassword("the real password");
    const parts = encoded.split("$");
    const validSaltHex = parts[4] ?? "";
    const corrupted = `scrypt$16384$8$1$${validSaltHex}$zzzznothex`;
    await expect(verifyPassword("literally-anything-wrong", corrupted)).resolves.toBe(false);
  });

  it("CR-01: rejects a stored hash truncated to zero-length hex without throwing", async () => {
    const encoded = await hashPassword("the real password");
    const parts = encoded.split("$");
    const validSaltHex = parts[4] ?? "";
    const corrupted = `scrypt$16384$8$1$${validSaltHex}$`;
    await expect(verifyPassword("anything", corrupted)).resolves.toBe(false);
  });

  it("CR-01: rejects a stored hash whose decoded byte length isn't exactly KEY_LEN (32)", async () => {
    const encoded = await hashPassword("the real password");
    const parts = encoded.split("$");
    const validSaltHex = parts[4] ?? "";
    // 20 bytes of valid hex -- well-formed hex, wrong decoded length.
    const wrongLengthHashHex = "aa".repeat(20);
    const corrupted = `scrypt$16384$8$1$${validSaltHex}$${wrongLengthHashHex}`;
    await expect(verifyPassword("anything", corrupted)).resolves.toBe(false);
  });

  it("CR-01: rejects a stored salt whose decoded byte length isn't exactly SALT_LEN (16)", async () => {
    const encoded = await hashPassword("the real password");
    const parts = encoded.split("$");
    const validHashHex = parts[5] ?? "";
    // 8 bytes of valid hex -- well-formed hex, wrong decoded length.
    const wrongLengthSaltHex = "bb".repeat(8);
    const corrupted = `scrypt$16384$8$1$${wrongLengthSaltHex}$${validHashHex}`;
    await expect(verifyPassword("anything", corrupted)).resolves.toBe(false);
  });

  it("CR-01: rejects a tampered N that is not a power of two or exceeds the bound, without invoking scrypt", async () => {
    const encoded = await hashPassword("the real password");
    const parts = encoded.split("$");
    const notPowerOfTwo = [parts[0], "16000", parts[2], parts[3], parts[4], parts[5]].join("$");
    await expect(verifyPassword("anything", notPowerOfTwo)).resolves.toBe(false);

    const tooLargeN = [parts[0], String(2 ** 30), parts[2], parts[3], parts[4], parts[5]].join("$");
    await expect(verifyPassword("anything", tooLargeN)).resolves.toBe(false);
  });

  it("CR-01: rejects a tampered negative/non-integer/zero r or p", async () => {
    const encoded = await hashPassword("the real password");
    const parts = encoded.split("$");

    const negativeR = [parts[0], parts[1], "-1", parts[3], parts[4], parts[5]].join("$");
    await expect(verifyPassword("anything", negativeR)).resolves.toBe(false);

    const fractionalP = [parts[0], parts[1], parts[2], "1.5", parts[4], parts[5]].join("$");
    await expect(verifyPassword("anything", fractionalP)).resolves.toBe(false);

    const zeroP = [parts[0], parts[1], parts[2], "0", parts[4], parts[5]].join("$");
    await expect(verifyPassword("anything", zeroP)).resolves.toBe(false);
  });

  it("stores a self-describing scrypt$N$r$p$salt$hash string", async () => {
    const encoded = await hashPassword("password1");
    const parts = encoded.split("$");
    expect(parts).toHaveLength(6);
    expect(parts[0]).toBe("scrypt");
    expect(parts[1]).toBe("16384");
    expect(parts[2]).toBe("8");
    expect(parts[3]).toBe("1");
  });
});
