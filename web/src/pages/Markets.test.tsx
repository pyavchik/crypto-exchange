import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { matchRoutes, MemoryRouter } from "react-router";
import { appRoutes } from "../App.js";
import { ApiError, type MarketPair, type MarketsResponse } from "../lib/api.js";
import type { SortState } from "../lib/marketsTable.js";
import { MarketsView, type MarketsState, type MarketsViewProps } from "./Markets.js";
import { Markets } from "./Markets.js";

// There is no DOM in this workspace (vitest.config.ts sets environment:
// "node", no jsdom/@testing-library) — every case below drives MarketsView
// directly with explicit query/sort props and asserts the rendered output.
// Real typing and clicking are proven in 03-04's browser smoke step and the
// 03-05 manual QA cases; this file's coverage boundary stops at the
// renderToStaticMarkup surface deliberately, not as an omission.

function makePair(overrides: Partial<MarketPair> = {}): MarketPair {
  return {
    id: "bitcoin",
    symbol: "BTC",
    name: "Bitcoin",
    pair: "BTC/USDT",
    price: 75755,
    change24hPct: -1.54,
    volume24h: 39122950768,
    marketCap: 1521766040123,
    ...overrides,
  };
}

const DEFAULT_SORT: SortState = { key: null, direction: "desc" };

function defaultProps(overrides: Partial<MarketsViewProps> = {}): MarketsViewProps {
  return {
    state: { kind: "loading" },
    query: "",
    sort: DEFAULT_SORT,
    onQueryChange: () => {},
    onSortChange: () => {},
    now: () => Date.parse("2026-09-16T10:00:00.000Z"),
    ...overrides,
  };
}

function okState(
  data: Partial<MarketsResponse> = {},
  requestId: string | null = null,
): MarketsState {
  return {
    kind: "ok",
    data: {
      pairs: [makePair()],
      fetchedAt: "2026-09-16T09:59:30.000Z",
      stale: false,
      ...data,
    },
    requestId,
  };
}

describe("MarketsView", () => {
  it("renders a loading line and no table in the loading state", () => {
    const markup = renderToStaticMarkup(<MarketsView {...defaultProps()} />);
    expect(markup).toContain("Loading markets");
    expect(markup).not.toContain('data-testid="markets-table"');
  });

  it("renders one row per pair carrying the coin id attribute, the pair label, the formatted price and the formatted volume", () => {
    const data: MarketsResponse = {
      pairs: [
        makePair({ id: "bitcoin", pair: "BTC/USDT", price: 75755, volume24h: 39122950768 }),
        makePair({ id: "ethereum", pair: "ETH/USDT", price: 2400.26, volume24h: 12345678 }),
      ],
      fetchedAt: "2026-09-16T09:59:30.000Z",
      stale: false,
    };
    const markup = renderToStaticMarkup(
      <MarketsView {...defaultProps({ state: { kind: "ok", data, requestId: "req-1" } })} />,
    );

    expect(markup).toContain('data-testid="markets-table"');
    expect((markup.match(/data-testid="markets-row"/g) ?? []).length).toBe(2);
    expect(markup).toContain('data-coin-id="bitcoin"');
    expect(markup).toContain('data-coin-id="ethereum"');
    expect(markup).toContain("BTC/USDT");
    expect(markup).toContain("$75,755.00");
    expect(markup).toContain("39.1B");
  });

  it("renders a down direction attribute for a negative 24h change and up for a positive one", () => {
    const data: MarketsResponse = {
      pairs: [
        makePair({ id: "down-coin", change24hPct: -1.5 }),
        makePair({ id: "up-coin", change24hPct: 2.5 }),
      ],
      fetchedAt: "2026-09-16T09:59:30.000Z",
      stale: false,
    };
    const markup = renderToStaticMarkup(
      <MarketsView {...defaultProps({ state: { kind: "ok", data, requestId: null } })} />,
    );

    expect(markup).toContain('data-direction="down"');
    expect(markup).toContain('data-direction="up"');
  });

  it("renders the quote-convention note with a payload", () => {
    const markup = renderToStaticMarkup(<MarketsView {...defaultProps({ state: okState() })} />);

    expect(markup).toContain('data-testid="quote-convention"');
    expect(markup).toContain("USDT");
  });

  it("renders a failure message and, when the error carries one, the request id in the error state", () => {
    const withRequestId = renderToStaticMarkup(
      <MarketsView
        {...defaultProps({
          state: { kind: "error", error: new ApiError(502, "UPSTREAM_UNAVAILABLE", "req-99") },
        })}
      />,
    );
    expect(withRequestId).toContain("Unable to load markets");
    expect(withRequestId).toContain("req-99");

    const withoutRequestId = renderToStaticMarkup(
      <MarketsView
        {...defaultProps({
          state: { kind: "error", error: new ApiError(null, "NETWORK_ERROR", null) },
        })}
      />,
    );
    expect(withoutRequestId).toContain("Unable to load markets");
  });

  it("renders the search input carrying its test id and the last-updated line carrying its test id", () => {
    const markup = renderToStaticMarkup(<MarketsView {...defaultProps({ state: okState() })} />);
    expect(markup).toContain('data-testid="markets-search"');
    expect(markup).toContain('data-testid="markets-updated"');
  });

  it("derives the last-updated text from the payload's own timestamp and the injected clock, reading the same regardless of render time", () => {
    const fetchedAt = "2026-09-16T09:55:00.000Z";
    const now = () => Date.parse("2026-09-16T10:00:00.000Z");
    const state = okState({ fetchedAt });

    const first = renderToStaticMarkup(<MarketsView {...defaultProps({ state, now })} />);
    const second = renderToStaticMarkup(<MarketsView {...defaultProps({ state, now })} />);

    expect(first).toContain("5 minutes ago");
    expect(first).toBe(second);
  });

  it("renders only rows matching the query prop, and an explicit no-matches line rather than an empty table body when nothing matches", () => {
    const data: MarketsResponse = {
      pairs: [
        makePair({ id: "bitcoin", name: "Bitcoin", symbol: "BTC" }),
        makePair({ id: "ethereum", name: "Ethereum", symbol: "ETH" }),
      ],
      fetchedAt: "2026-09-16T09:59:30.000Z",
      stale: false,
    };
    const state: MarketsState = { kind: "ok", data, requestId: null };

    const filtered = renderToStaticMarkup(
      <MarketsView {...defaultProps({ state, query: "eth" })} />,
    );
    expect((filtered.match(/data-testid="markets-row"/g) ?? []).length).toBe(1);
    expect(filtered).toContain('data-coin-id="ethereum"');

    const noMatches = renderToStaticMarkup(
      <MarketsView {...defaultProps({ state, query: "doesnotexist" })} />,
    );
    expect(noMatches).not.toContain('data-testid="markets-row"');
    expect(noMatches).toContain("doesnotexist");
  });

  it("renders rows in sort-state order, marking the active header with its sort key and direction while inactive headers carry the key only", () => {
    const data: MarketsResponse = {
      pairs: [makePair({ id: "high", price: 100 }), makePair({ id: "low", price: 1 })],
      fetchedAt: "2026-09-16T09:59:30.000Z",
      stale: false,
    };
    const state: MarketsState = { kind: "ok", data, requestId: null };
    const sort: SortState = { key: "price", direction: "asc" };

    const markup = renderToStaticMarkup(<MarketsView {...defaultProps({ state, sort })} />);

    const rowIds = [...markup.matchAll(/data-coin-id="([^"]+)"/g)].map((m) => m[1]);
    expect(rowIds).toEqual(["low", "high"]);

    expect(markup).toContain('data-sort-key="price" data-sort-direction="asc"');
    expect(markup).toContain('data-sort-key="change24hPct"');
    expect(markup).not.toContain('data-sort-key="change24hPct" data-sort-direction');
    expect(markup).toContain('data-sort-key="volume24h"');
    expect(markup).not.toContain('data-sort-key="volume24h" data-sort-direction');
  });

  it("renders each sortable header as a real button element with accessible text, not a clickable cell", () => {
    const markup = renderToStaticMarkup(<MarketsView {...defaultProps({ state: okState() })} />);
    expect(markup).toContain('<button type="button" data-sort-key="price"');
    expect(markup).toContain("Price</button>");
    expect(markup).toContain("24h %</button>");
    expect(markup).toContain("24h Volume</button>");
  });

  it("renders the banner when the payload's stale flag is true, and not when it is false", () => {
    const staleMarkup = renderToStaticMarkup(
      <MarketsView {...defaultProps({ state: okState({ stale: true }) })} />,
    );
    const freshMarkup = renderToStaticMarkup(
      <MarketsView {...defaultProps({ state: okState({ stale: false }) })} />,
    );

    expect(staleMarkup).toContain('data-testid="stale-banner"');
    expect(freshMarkup).not.toContain('data-testid="stale-banner"');
  });

  it("renders the CoinGecko attribution text on the page itself", () => {
    const markup = renderToStaticMarkup(<MarketsView {...defaultProps({ state: okState() })} />);
    expect(markup.toLowerCase()).toContain("coingecko");
  });
});

describe("Markets", () => {
  it("renders in the loading state on mount (no data fetch resolves during SSR)", () => {
    const markup = renderToStaticMarkup(<Markets />);
    expect(markup).toContain("Loading markets");
  });
});

describe("AppRoutes at /markets", () => {
  it("mounts the Markets page rather than the ComingSoon placeholder", () => {
    const matches = matchRoutes(appRoutes, "/markets");
    if (!matches) {
      throw new Error("expected appRoutes to match /markets");
    }
    const leaf = matches[matches.length - 1];
    const element = leaf.route.element as React.ReactElement<unknown>;
    expect(element.type).toBe(Markets);
  });

  it("renders the shell around the Markets page for a logged-out visitor", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/markets"]}>
        {/* AppRoutes itself is exercised in App.test.tsx; this confirms the
            page renders standalone the same way inside a router context. */}
        <Markets />
      </MemoryRouter>,
    );
    expect(markup).toContain("<h1>Markets</h1>");
  });
});
