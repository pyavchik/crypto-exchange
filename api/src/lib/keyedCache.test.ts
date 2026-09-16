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
    const now = 1_700_000_000_000;
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
    const now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    const fetcher = vi.fn(async () => "value");

    expect(cache.peek("key")).toBeUndefined();
    await cache.resolve("key", 45_000, fetcher);
    expect(cache.peek("key")).toEqual({ value: "value", fetchedAt: now });
  });
});

describe("createKeyedCache — stale fallback (D-41/D-43)", () => {
  it("falls back to the expired entry's value and original fetchedAt when the fetcher rejects, calling onStale exactly once with the key, reason and age", async () => {
    let now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    await cache.resolve("key", 1_000, async () => "good-value");
    const originalFetchedAt = now;

    now += 1_001; // past the TTL
    const failing = vi.fn(async () => {
      throw Object.assign(new Error("upstream down"), { reason: "http_503" });
    });
    const onStale = vi.fn();

    const result = await cache.resolve("key", 1_000, failing, { onStale });

    expect(result).toEqual({ value: "good-value", fetchedAt: originalFetchedAt, stale: true });
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onStale).toHaveBeenCalledWith("key", "http_503", 1_001);
  });

  it("rejects with the fetcher's own error and never calls onStale when nothing has ever been cached", async () => {
    const cache = createKeyedCache<string>();
    const onStale = vi.fn();
    const error = new Error("cold start failure");
    const failing = vi.fn(async () => {
      throw error;
    });

    await expect(cache.resolve("key", 1_000, failing, { onStale })).rejects.toBe(error);
    expect(onStale).not.toHaveBeenCalled();
    expect(cache.peek("key")).toBeUndefined();
  });

  it("retries the upstream on the very next resolve call after a stale serve, since fetchedAt is left unchanged", async () => {
    let now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    await cache.resolve("key", 1_000, async () => "good-value");

    now += 1_001;
    const firstFailure = vi.fn(async () => {
      throw new Error("down");
    });
    await cache.resolve("key", 1_000, firstFailure);
    expect(firstFailure).toHaveBeenCalledTimes(1);

    const secondFailure = vi.fn(async () => {
      throw new Error("still down");
    });
    await cache.resolve("key", 1_000, secondFailure);
    expect(secondFailure).toHaveBeenCalledTimes(1);
  });

  it("returns stale: false with a new fetchedAt once the fetcher succeeds again after a stale serve", async () => {
    let now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    await cache.resolve("key", 1_000, async () => "v1");

    now += 1_001;
    await cache.resolve("key", 1_000, async () => {
      throw new Error("down");
    });

    now += 10;
    const result = await cache.resolve("key", 1_000, async () => "v2");
    expect(result).toEqual({ value: "v2", fetchedAt: now, stale: false });
  });

  it("serves the same stale result to concurrent callers during an upstream failure, invoking the fetcher exactly once and onStale exactly once", async () => {
    let now = 1_700_000_000_000;
    const cache = createKeyedCache<string>({ now: () => now });
    await cache.resolve("key", 1_000, async () => "good-value");
    const originalFetchedAt = now;

    now += 1_001;
    let calls = 0;
    const failing = vi.fn(
      () =>
        new Promise<string>((_resolve, reject) => {
          calls += 1;
          setTimeout(() => reject(new Error("down")), 20);
        }),
    );
    const onStale = vi.fn();

    const results = await Promise.all(
      Array.from({ length: 5 }, () => cache.resolve("key", 1_000, failing, { onStale })),
    );

    expect(calls).toBe(1);
    for (const result of results) {
      expect(result).toEqual({ value: "good-value", fetchedAt: originalFetchedAt, stale: true });
    }
    expect(onStale).toHaveBeenCalledTimes(1);
  });
});
