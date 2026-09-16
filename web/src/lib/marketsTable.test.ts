import { describe, expect, it } from "vitest";
import type { MarketPair } from "./api.js";
import {
  compareNullable,
  filterMarkets,
  nextSortState,
  sortMarkets,
  type SortState,
} from "./marketsTable.js";

// A deliberately hostile fixture: a price in the tens of thousands, a
// sub-cent price, an absent 24h change, two entries with an exact volume
// tie, and mixed-case names/symbols — one fixture exercises the magnitude
// spread, the null-last rule and the tie-break together (D-46).
const BITCOIN: MarketPair = {
  id: "bitcoin",
  symbol: "BTC",
  name: "Bitcoin",
  pair: "BTC/USDT",
  price: 65123.45,
  change24hPct: 2.5,
  volume24h: 500_000_000,
  marketCap: 1_200_000_000_000,
};

const SHIBA: MarketPair = {
  id: "shiba-inu",
  symbol: "shib",
  name: "Shiba Inu",
  pair: "SHIB/USDT",
  price: 0.0000652,
  change24hPct: -5.1,
  volume24h: 200_000_000,
  marketCap: 5_000_000_000,
};

const ETHEREUM: MarketPair = {
  id: "ethereum",
  symbol: "ETH",
  name: "Ethereum",
  pair: "ETH/USDT",
  price: 3200.5,
  change24hPct: null,
  volume24h: 300_000_000,
  marketCap: 400_000_000_000,
};

const AARDVARK: MarketPair = {
  id: "aardvark-coin",
  symbol: "AAA",
  name: "Aardvark Coin",
  pair: "AAA/USDT",
  price: 12.34,
  change24hPct: 0.1,
  // Exact tie with ETHEREUM's volume24h, for the deterministic tie-break test.
  volume24h: 300_000_000,
  marketCap: 1_000_000,
};

const FIXTURE: MarketPair[] = [BITCOIN, SHIBA, ETHEREUM, AARDVARK];

describe("filterMarkets", () => {
  it("returns every pair, in the original order and as the same values, for an empty query", () => {
    expect(filterMarkets(FIXTURE, "")).toEqual(FIXTURE);
  });

  it("returns every pair for a whitespace-only query", () => {
    expect(filterMarkets(FIXTURE, "   ")).toEqual(FIXTURE);
  });

  it("matches a lowercase query against a mixed-case coin name", () => {
    expect(filterMarkets(FIXTURE, "shiba")).toEqual([SHIBA]);
  });

  it("matches a lowercase query against a mixed-case symbol", () => {
    expect(filterMarkets(FIXTURE, "eth")).toEqual([ETHEREUM]);
  });

  it("matches a substring, not only a prefix", () => {
    expect(filterMarkets(FIXTURE, "ardva")).toEqual([AARDVARK]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterMarkets(FIXTURE, "nonexistent-coin-xyz")).toEqual([]);
  });
});

describe("compareNullable", () => {
  it("places a null after any number in ascending order", () => {
    expect(compareNullable(null, 5, "asc")).toBeGreaterThan(0);
    expect(compareNullable(5, null, "asc")).toBeLessThan(0);
  });

  it("places a null after any number in descending order too", () => {
    expect(compareNullable(null, 5, "desc")).toBeGreaterThan(0);
    expect(compareNullable(5, null, "desc")).toBeLessThan(0);
  });

  it("returns zero for two nulls", () => {
    expect(compareNullable(null, null, "asc")).toBe(0);
    expect(compareNullable(null, null, "desc")).toBe(0);
  });

  it("compares numerically according to the direction when both are present", () => {
    expect(compareNullable(1, 2, "asc")).toBeLessThan(0);
    expect(compareNullable(1, 2, "desc")).toBeGreaterThan(0);
  });
});

describe("sortMarkets", () => {
  it("orders a fixture spanning eight orders of magnitude correctly by price descending, including the sub-cent entry", () => {
    const sorted = sortMarkets(FIXTURE, { key: "price", direction: "desc" });
    expect(sorted.map((p) => p.id)).toEqual(["bitcoin", "ethereum", "aardvark-coin", "shiba-inu"]);
  });

  it("places the most negative 24h change first and the absent entry last when ascending", () => {
    const sorted = sortMarkets(FIXTURE, { key: "change24hPct", direction: "asc" });
    expect(sorted.map((p) => p.id)).toEqual(["shiba-inu", "aardvark-coin", "bitcoin", "ethereum"]);
  });

  it("breaks an exact volume tie deterministically by coin id, stable across repeated sorts", () => {
    // bitcoin: 500M, ethereum & aardvark-coin: 300M (exact tie), shiba-inu: 200M.
    // Descending by volume, tie broken by ascending coin id lexicographically:
    // "aardvark-coin" < "ethereum".
    const first = sortMarkets(FIXTURE, { key: "volume24h", direction: "desc" });
    const second = sortMarkets(FIXTURE, { key: "volume24h", direction: "desc" });
    expect(first.map((p) => p.id)).toEqual(["bitcoin", "aardvark-coin", "ethereum", "shiba-inu"]);
    expect(second.map((p) => p.id)).toEqual(first.map((p) => p.id));
  });

  it("returns the payload's own order (the market-cap ranking already applied upstream) with no sort key", () => {
    const sorted = sortMarkets(FIXTURE, { key: null, direction: "desc" });
    expect(sorted.map((p) => p.id)).toEqual(FIXTURE.map((p) => p.id));
  });

  it("returns a new array and does not mutate its input", () => {
    const original = [...FIXTURE];
    const sorted = sortMarkets(FIXTURE, { key: "price", direction: "asc" });
    expect(sorted).not.toBe(FIXTURE);
    expect(FIXTURE).toEqual(original);
  });
});

describe("nextSortState", () => {
  it("sets descending when a new key is clicked", () => {
    const current: SortState = { key: null, direction: "desc" };
    expect(nextSortState(current, "price")).toEqual({ key: "price", direction: "desc" });
  });

  it("sets descending when switching from a different active key", () => {
    const current: SortState = { key: "volume24h", direction: "asc" };
    expect(nextSortState(current, "price")).toEqual({ key: "price", direction: "desc" });
  });

  it("toggles direction when the currently active key is clicked again", () => {
    const descending: SortState = { key: "price", direction: "desc" };
    expect(nextSortState(descending, "price")).toEqual({ key: "price", direction: "asc" });

    const ascending: SortState = { key: "price", direction: "asc" };
    expect(nextSortState(ascending, "price")).toEqual({ key: "price", direction: "desc" });
  });
});
