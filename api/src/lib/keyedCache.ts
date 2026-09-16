export interface CacheEntry<T> {
  value: T;
  fetchedAt: number;
}

export interface ResolveResult<T> {
  value: T;
  fetchedAt: number;
  stale: boolean;
}

export interface InFlightRegistry {
  run<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

/**
 * T-01-17 / D-39: the single in-flight-dedupe primitive in this repo. Two
 * near-simultaneous callers racing the same key must never both start an
 * upstream fetch — `coingecko.ts` fixed this once for the `/ping` resource
 * with a module-scoped `let inFlight` promise slot; this generalizes that
 * same idiom to any number of keyed resources via a `Map`.
 *
 * The registration into the map happens synchronously, in the same turn as
 * the `fn()` call and before any `await` — that ordering is the entire point
 * of the primitive. If it happened after an `await`, two callers could both
 * observe an empty map and both start a fetch, exactly the race T-01-17
 * closed once already.
 */
export function createInFlightRegistry(): InFlightRegistry {
  const inFlight = new Map<string, Promise<unknown>>();

  return {
    run<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const existing = inFlight.get(key) as Promise<T> | undefined;
      if (existing) {
        return existing;
      }

      // Synchronous registration before any await: the slot clears on both
      // success and rejection, so a later `run` on this key always starts a
      // fresh call rather than replaying a stale outcome.
      const promise = fn().finally(() => {
        inFlight.delete(key);
      });
      inFlight.set(key, promise);
      return promise;
    },
  };
}

export interface KeyedCacheOptions {
  now?: () => number;
}

export interface KeyedCache<T> {
  resolve(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<ResolveResult<T>>;
  peek(key: string): CacheEntry<T> | undefined;
}

/**
 * A generalized TTL cache keyed by resource, backed by the in-flight
 * registry above. Deliberately an in-memory `Map`, not the SQLite-backed
 * table `coingecko.ts` uses for `/ping` — the values here have no audit-trail
 * requirement and are cheaply rebuilt on every TTL window, so a durable store
 * would only add write-amplification for no benefit (Claude's Discretion,
 * 03-CONTEXT.md). Swapping in a durable store later is a change behind this
 * function only.
 *
 * Note: an in-memory store does not deduplicate across processes, so a
 * future horizontally-scaled deployment would multiply the upstream call
 * rate by the instance count.
 */
export function createKeyedCache<T>(options: KeyedCacheOptions = {}): KeyedCache<T> {
  const { now = Date.now } = options;
  const cache = new Map<string, CacheEntry<T>>();
  const registry = createInFlightRegistry();

  return {
    async resolve(key, ttlMs, fetcher) {
      const cached = cache.get(key);
      const nowMs = now();
      if (cached && nowMs - cached.fetchedAt < ttlMs) {
        return { value: cached.value, fetchedAt: cached.fetchedAt, stale: false };
      }

      // A rejecting fetcher rejects straight out of resolve() in this plan —
      // 03-02 adds the last-good fallback branch and its onStale hook; the
      // D-41 stale-serve behavior belongs to that plan, not this one.
      const entry = await registry.run(key, async (): Promise<CacheEntry<T>> => {
        const value = await fetcher();
        const newEntry: CacheEntry<T> = { value, fetchedAt: now() };
        cache.set(key, newEntry);
        return newEntry;
      });

      return { value: entry.value, fetchedAt: entry.fetchedAt, stale: false };
    },
    peek(key) {
      return cache.get(key);
    },
  };
}
