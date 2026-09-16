import { describe, expect, it, vi } from "vitest";
import { createInFlightRegistry, createKeyedCache } from "./keyedCache.js";

describe("createInFlightRegistry", () => {
  it("invokes fn once when five callers race on the same key, and all five resolve to the same value", async () => {
    const registry = createInFlightRegistry();
    const fn = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("value"), 20);
        }),
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => registry.run("shared-key", fn)),
    );

    expect(fn).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toBe("value");
    }
  });

  it("runs fn twice for two different keys raced concurrently — a miss on one key never queues behind a miss on another", async () => {
    const registry = createInFlightRegistry();
    const calls: string[] = [];
    const fn = (key: string) =>
      new Promise<string>((resolve) => {
        calls.push(key);
        setTimeout(() => resolve(key), 20);
      });

    const [a, b] = await Promise.all([
      registry.run("key-a", () => fn("key-a")),
      registry.run("key-b", () => fn("key-b")),
    ]);

    expect(a).toBe("key-a");
    expect(b).toBe("key-b");
    expect(calls).toEqual(["key-a", "key-b"]);
  });

  it("invokes fn again on a later run after the promise for a key settles (success)", async () => {
    const registry = createInFlightRegistry();
    const fn = vi.fn(async () => "ok");

    await registry.run("key", fn);
    await registry.run("key", fn);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("invokes fn again on a later run after the promise for a key settles (rejection clears the slot too)", async () => {
    const registry = createInFlightRegistry();
    const fn = vi.fn(async () => {
      throw new Error("boom");
    });

    await expect(registry.run("key", fn)).rejects.toThrow("boom");
    await expect(registry.run("key", fn)).rejects.toThrow("boom");

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("createKeyedCache", () => {
  it("calls the fetcher on the first call and returns stale: false with a fetchedAt from the injected clock", async () => {
    let now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    const fetcher = vi.fn(async () => "value-1");

    const result = await cache.resolve("key", 45_000, fetcher);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ value: "value-1", fetchedAt: now, stale: false });
  });

  it("returns the cached value under the TTL without calling the fetcher again, and refetches exactly one ms past the TTL", async () => {
    let now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    const fetcher = vi.fn(async () => `value-at-${now}`);

    const first = await cache.resolve("key", 45_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    now += 45_000 - 1;
    const second = await cache.resolve("key", 45_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);

    now += 1;
    const third = await cache.resolve("key", 45_000, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(third.value).toBe(`value-at-${now}`);
    expect(third.stale).toBe(false);
  });

  it("dedupes concurrent misses on the same key into a single fetcher call", async () => {
    const cache = createKeyedCache<number>();
    let calls = 0;
    const fetcher = vi.fn(
      () =>
        new Promise<number>((resolve) => {
          calls += 1;
          setTimeout(() => resolve(calls), 20);
        }),
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => cache.resolve("key", 45_000, fetcher)),
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it("rejects out of resolve when the fetcher rejects, and peek stays empty", async () => {
    const cache = createKeyedCache<string>();
    const fetcher = vi.fn(async () => {
      throw new Error("upstream down");
    });

    await expect(cache.resolve("key", 45_000, fetcher)).rejects.toThrow("upstream down");
    expect(cache.peek("key")).toBeUndefined();
  });

  it("peek returns the current entry without triggering a fetch", async () => {
    let now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    const fetcher = vi.fn(async () => "value");

    expect(cache.peek("key")).toBeUndefined();
    await cache.resolve("key", 45_000, fetcher);
    expect(cache.peek("key")).toEqual({ value: "value", fetchedAt: now });
  });
});
