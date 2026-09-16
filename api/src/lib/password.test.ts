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
    // Widen the hash hex (append two hex chars) so its byte length no longer
    // matches KEY_LEN. verifyPassword must derive its candidate key at the
    // stored hash's own byte length (not a hardcoded KEY_LEN) and reject
    // cleanly — timingSafeEqual throws on a byte-length mismatch, which this
    // pins down as unreachable.
    const corrupted = [...parts.slice(0, 5), `${parts[5]}ab`].join("$");
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
