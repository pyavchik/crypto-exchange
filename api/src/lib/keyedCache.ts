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

/**
 * D-41/D-43: options for the stale-fallback branch. `onStale` fires exactly
 * once per actual upstream failure (never once per concurrent caller — see
 * the in-flight-dedupe note on `resolve` below), carrying the cache key, a
 * short machine reason and the age in milliseconds of the entry being served
 * in its place.
 */
export interface ResolveOptions {
  onStale?: (key: string, reason: string, ageMs: number) => void;
}

export interface KeyedCache<T> {
  resolve(
    key: string,
    ttlMs: number,
    fetcher: () => Promise<T>,
    options?: ResolveOptions,
  ): Promise<ResolveResult<T>>;
  peek(key: string): CacheEntry<T> | undefined;
}

/**
 * Extracts a short machine reason from a rejected fetcher's error, for the
 * `onStale` callback. Prefers a `reason` string property when the error
 * carries one (e.g. `MarketDataUpstreamError.reason` — `http_429`,
 * `timeout`, `malformed_body`), since that is the classification callers
 * actually want logged; falls back to the error's own message, and finally
 * to a plain string coercion for a non-Error throw.
 */
function reasonFromError(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "reason" in error &&
    typeof (error as { reason?: unknown }).reason === "string"
  ) {
    return (error as { reason: string }).reason;
  }
  return error instanceof Error ? error.message : String(error);
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
    async resolve(key, ttlMs, fetcher, resolveOptions = {}) {
      const cached = cache.get(key);
      const nowMs = now();
      if (cached && nowMs - cached.fetchedAt < ttlMs) {
        return { value: cached.value, fetchedAt: cached.fetchedAt, stale: false };
      }

      // The in-flight registration happens synchronously inside registry.run,
      // before any await — a burst of concurrent resolve() calls for this key
      // therefore share ONE upstream attempt and, on failure, this catch
      // block runs exactly once (it lives inside the fn passed to
      // registry.run, not in each external caller's own call site), so
      // onStale below fires once per real failure, never once per caller.
      const outcome = await registry.run(
        key,
        async (): Promise<{ entry: CacheEntry<T>; stale: boolean }> => {
          try {
            const value = await fetcher();
            const newEntry: CacheEntry<T> = { value, fetchedAt: now() };
            cache.set(key, newEntry);
            return { entry: newEntry, stale: false };
          } catch (error) {
            // D-41: on failure, fall back to the last-good cached value (even
            // if expired) rather than propagating — but only when one
            // exists. A cold key (nothing has ever been cached) still
            // rejects with the fetcher's own error: there is nothing to
            // fall back to, and the caller's D-09 502 path depends on this
            // rejection reaching it untouched.
            //
            // Deliberately never writes into `cache` on this branch: leaving
            // the entry's `fetchedAt` untouched is what makes the very next
            // resolve() call for this key retry the upstream instead of
            // treating the fallback as fresh, and it is what lets the caller
            // report exactly how old the served data genuinely is.
            //
            // Only the FIRST entry's timestamp is ever authoritative here —
            // a deliberate divergence from the ping service (coingecko.ts),
            // whose failed check is recorded as a fresh "down" result rather
            // than falling back to a previous one.
            if (!cached) {
              throw error;
            }
            const ageMs = now() - cached.fetchedAt;
            resolveOptions.onStale?.(key, reasonFromError(error), ageMs);
            return { entry: cached, stale: true };
          }
        },
      );

      return {
        value: outcome.entry.value,
        fetchedAt: outcome.entry.fetchedAt,
        stale: outcome.stale,
      };
    },
    peek(key) {
      return cache.get(key);
    },
  };
}
