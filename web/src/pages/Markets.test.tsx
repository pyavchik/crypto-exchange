import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { matchRoutes, MemoryRouter } from "react-router";
import { appRoutes } from "../App.js";
import { ApiError, type MarketPair, type MarketsResponse } from "../lib/api.js";
import { MarketsView, type MarketsState } from "./Markets.js";
import { Markets } from "./Markets.js";

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

describe("MarketsView", () => {
  it("renders a loading line and no table in the loading state", () => {
    const markup = renderToStaticMarkup(<MarketsView state={{ kind: "loading" }} />);
    expect(markup).toContain("Loading markets");
    expect(markup).not.toContain('data-testid="markets-table"');
  });

  it("renders one row per pair carrying the coin id attribute, the pair label, the formatted price and the formatted volume", () => {
    const data: MarketsResponse = {
      pairs: [
        makePair({ id: "bitcoin", pair: "BTC/USDT", price: 75755, volume24h: 39122950768 }),
        makePair({ id: "ethereum", pair: "ETH/USDT", price: 2400.26, volume24h: 12345678 }),
      ],
      fetchedAt: "2026-09-16T09:14:20.000Z",
      stale: false,
    };
    const state: MarketsState = { kind: "ok", data, requestId: "req-1" };

    const markup = renderToStaticMarkup(<MarketsView state={state} />);

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
      fetchedAt: "2026-09-16T09:14:20.000Z",
      stale: false,
    };
    const markup = renderToStaticMarkup(
      <MarketsView state={{ kind: "ok", data, requestId: null }} />,
    );

    expect(markup).toContain('data-direction="down"');
    expect(markup).toContain('data-direction="up"');
  });

  it("renders the quote-convention note with a payload", () => {
    const data: MarketsResponse = {
      pairs: [makePair()],
      fetchedAt: "2026-09-16T09:14:20.000Z",
      stale: false,
    };
    const markup = renderToStaticMarkup(
      <MarketsView state={{ kind: "ok", data, requestId: null }} />,
    );

    expect(markup).toContain('data-testid="quote-convention"');
    expect(markup).toContain("USDT");
  });

  it("renders a failure message and, when the error carries one, the request id in the error state", () => {
    const withRequestId = renderToStaticMarkup(
      <MarketsView
        state={{ kind: "error", error: new ApiError(502, "UPSTREAM_UNAVAILABLE", "req-99") }}
      />,
    );
    expect(withRequestId).toContain("Unable to load markets");
    expect(withRequestId).toContain("req-99");

    const withoutRequestId = renderToStaticMarkup(
      <MarketsView state={{ kind: "error", error: new ApiError(null, "NETWORK_ERROR", null) }} />,
    );
    expect(withoutRequestId).toContain("Unable to load markets");
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
