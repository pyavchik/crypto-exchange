import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter, matchRoutes } from "react-router";
import { appRoutes } from "../App.js";
import { ApiError, type MarketPair, type MarketsResponse } from "../lib/api.js";
import { Trade, TradeIndex, TradeView, type ChartState, type TradeViewProps } from "./Trade.js";

// There is no DOM in this workspace (vitest.config.ts sets environment:
// "node", no jsdom/@testing-library) — every case below drives TradeView
// directly with explicit props and asserts the rendered output. Real chart
// drawing, real interaction and the degraded path are proven in 03-04's
// browser smoke step; this file's coverage boundary stops at the
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

function marketsOk(
  data: Partial<MarketsResponse> = {},
): Extract<TradeViewProps["marketsState"], { kind: "ok" }> {
  return {
    kind: "ok",
    data: {
      pairs: [makePair()],
      fetchedAt: "2026-09-16T09:59:30.000Z",
      stale: false,
      ...data,
    },
    requestId: null,
  };
}

function chartOk(): ChartState {
  return {
    kind: "ok",
    data: {
      id: "bitcoin",
      window: "1d",
      points: [
        { time: 1_700_000_000, value: 100 },
        { time: 1_700_000_060, value: 101 },
      ],
      fetchedAt: "2026-09-16T09:59:30.000Z",
      stale: false,
    },
  };
}

function defaultProps(overrides: Partial<TradeViewProps> = {}): TradeViewProps {
  return {
    coinId: "bitcoin",
    marketsState: marketsOk(),
    chartState: chartOk(),
    window: "1d",
    onWindowChange: () => {},
    now: () => Date.parse("2026-09-16T10:00:00.000Z"),
    ...overrides,
  };
}

// A router Link appears in some TradeView branches (the unknown-market and
// TradeIndex-error links) — wrapping every render in a MemoryRouter keeps
// this helper safe regardless of which branch a given case exercises.
function renderTradeView(props: TradeViewProps): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TradeView {...props} />
    </MemoryRouter>,
  );
}

describe("TradeView", () => {
  it("renders the pair label, formatted price, 24h change with its direction attribute, and the chart container", () => {
    const markup = renderTradeView(
      defaultProps({
        marketsState: marketsOk({
          pairs: [makePair({ pair: "BTC/USDT", price: 75755, change24hPct: -1.54 })],
        }),
      }),
    );

    expect(markup).toContain("BTC/USDT");
    expect(markup).toContain("$75,755.00");
    expect(markup).toContain('data-direction="down"');
    expect(markup).toContain('data-testid="price-chart"');
  });

  it("renders three window controls carrying a data-window attribute of 1d, 7d and 30d, with only the active one carrying an active marker", () => {
    const markup = renderTradeView(defaultProps({ window: "7d" }));

    expect(markup).toContain('data-window="1d"');
    expect(markup).toContain('data-window="7d"');
    expect(markup).toContain('data-window="30d"');
    expect(markup).toContain('data-window="7d" data-active="true"');
    expect(markup).not.toContain('data-window="1d" data-active');
    expect(markup).not.toContain('data-window="30d" data-active');
  });

  it("renders the prices-delayed banner when the markets payload is stale, and not when it is fresh", () => {
    const staleMarkup = renderTradeView(defaultProps({ marketsState: marketsOk({ stale: true }) }));
    const freshMarkup = renderTradeView(
      defaultProps({ marketsState: marketsOk({ stale: false }) }),
    );

    expect(staleMarkup).toContain('data-testid="stale-banner"');
    expect(freshMarkup).not.toContain('data-testid="stale-banner"');
  });

  it("renders a CoinGecko credit naming it as the source of both the prices and the chart series", () => {
    const markup = renderTradeView(defaultProps());
    const lowered = markup.toLowerCase();

    expect(lowered).toContain("coingecko");
    expect(lowered).toContain("chart");
  });

  it("renders a loading line and no chart container in the loading state", () => {
    const markup = renderTradeView(defaultProps({ marketsState: { kind: "loading" } }));

    expect(markup).toContain("Loading");
    expect(markup).not.toContain('data-testid="price-chart"');
  });

  it("renders a not-tradable message and a link back to markets on an unknown-market error, keyed on the error's code", () => {
    const viaChartError = renderTradeView(
      defaultProps({
        chartState: { kind: "error", error: new ApiError(404, "UNKNOWN_MARKET", "req-1") },
      }),
    );
    expect(viaChartError).toContain('data-testid="unknown-market"');
    expect(viaChartError).toContain('href="/markets"');

    // Also unknown when the pair itself is simply absent from the curated
    // list the markets payload already returned (dropped out since the page
    // was last open), even before any chart-specific error has arrived.
    const viaMissingPair = renderTradeView(
      defaultProps({
        coinId: "not-in-the-list",
        chartState: { kind: "loading" },
      }),
    );
    expect(viaMissingPair).toContain('data-testid="unknown-market"');
    expect(viaMissingPair).toContain('href="/markets"');
  });

  it("renders the failure message and the request id (when present) for any other API error", () => {
    const withRequestId = renderTradeView(
      defaultProps({
        chartState: { kind: "error", error: new ApiError(502, "UPSTREAM_UNAVAILABLE", "req-99") },
      }),
    );
    expect(withRequestId).toContain("Unable to load chart data");
    expect(withRequestId).toContain("req-99");

    const withoutRequestId = renderTradeView(
      defaultProps({
        marketsState: { kind: "error", error: new ApiError(null, "NETWORK_ERROR", null) },
      }),
    );
    expect(withoutRequestId).toContain("Unable to load trade data");
  });
});

describe("TradeIndex", () => {
  it("renders a loading line while the markets payload is being fetched", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <TradeIndex fetchMarketsImpl={() => new Promise(() => {})} />
      </MemoryRouter>,
    );
    expect(markup).toContain("Loading");
  });
});

describe("Trade (wrapper)", () => {
  it("renders in the loading state on mount (no data fetch resolves during SSR)", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/trade/bitcoin"]}>
        <Trade />
      </MemoryRouter>,
    );
    expect(markup).toContain("Loading");
  });
});

describe("AppRoutes at /trade/:id", () => {
  it("mounts the Trade page rather than the ComingSoon placeholder", () => {
    const matches = matchRoutes(appRoutes, "/trade/bitcoin");
    if (!matches) {
      throw new Error("expected appRoutes to match /trade/:id");
    }
    const leaf = matches[matches.length - 1];
    const element = leaf.route.element as React.ReactElement<unknown>;
    expect(element.type).toBe(Trade);
  });

  it("mounts TradeIndex at the bare /trade route", () => {
    const matches = matchRoutes(appRoutes, "/trade");
    if (!matches) {
      throw new Error("expected appRoutes to match /trade");
    }
    const leaf = matches[matches.length - 1];
    const element = leaf.route.element as React.ReactElement<unknown>;
    expect(element.type).toBe(TradeIndex);
  });
});
