// D-46: client-side search, sort and null-last comparison over the already-
// fetched top-20 markets payload. Twenty rows needs no server round-trip,
// and keeping this logic pure is the only way it can be tested at all in a
// workspace with no DOM (vitest.config.ts's environment is "node").
import type { MarketPair } from "./api.js";

// MKT-03's three sortable columns.
export const SORT_KEYS = ["price", "change24hPct", "volume24h"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type SortDirection = "asc" | "desc";

export interface SortState {
  key: SortKey | null;
  direction: SortDirection;
}

/**
 * Never subtracts values that might be absent — a naive numeric comparator
 * does not throw on a null, it produces a not-a-number comparison and
 * therefore an unspecified row order, which looks like a cosmetic sorting
 * quirk while actually being non-deterministic output. Returns zero when
 * both are absent, and places an absent value last regardless of direction
 * (checked before the direction is consulted at all).
 */
export function compareNullable(
  a: number | null,
  b: number | null,
  direction: SortDirection,
): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return direction === "asc" ? a - b : b - a;
}

/**
 * Trims and lowercases the query, returns the input unchanged when nothing
 * remains, and otherwise keeps pairs whose lowercased name or lowercased
 * symbol contains it (substring match, not only a prefix).
 */
export function filterMarkets(pairs: MarketPair[], query: string): MarketPair[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed === "") return pairs;
  return pairs.filter(
    (pair) =>
      pair.name.toLowerCase().includes(trimmed) || pair.symbol.toLowerCase().includes(trimmed),
  );
}

function fieldValue(pair: MarketPair, key: SortKey): number | null {
  return pair[key];
}

/**
 * Returns a new array. With a null key it returns a copy in the input's own
 * order, which is already the market-cap ranking the API applied upstream.
 * Otherwise sorts by the selected field through compareNullable, falling
 * back to a lexicographic comparison of coin ids whenever the primary
 * comparison is zero, so ties are deterministic rather than dependent on
 * engine behavior.
 */
export function sortMarkets(pairs: MarketPair[], sort: SortState): MarketPair[] {
  if (sort.key === null) return [...pairs];
  const { key, direction } = sort;
  return [...pairs].sort((a, b) => {
    const primary = compareNullable(fieldValue(a, key), fieldValue(b, key), direction);
    if (primary !== 0) return primary;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Descending for a newly selected key; flips direction when the active key
 * is selected again.
 */
export function nextSortState(current: SortState, key: SortKey): SortState {
  if (current.key !== key) {
    return { key, direction: "desc" };
  }
  return { key, direction: current.direction === "desc" ? "asc" : "desc" };
}
