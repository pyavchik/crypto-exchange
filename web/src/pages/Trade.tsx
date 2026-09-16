import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import {
  ApiError,
  CHART_WINDOWS,
  fetchMarkets as realFetchMarkets,
  fetchMarketChart as realFetchMarketChart,
  type ChartResponse,
  type ChartWindow,
  type MarketsResponse,
} from "../lib/api.js";
import { formatPercent, formatPrice, QUOTE_SYMBOL } from "../lib/format.js";
import { createMarketsPoller, type MarketsState } from "../lib/marketsPoller.js";
import type { VisibilityAdapter } from "../lib/poller.js";
import { StaleBanner } from "../components/StaleBanner.js";
import { PriceChart } from "../components/PriceChart.js";

export type { MarketsState };

const WINDOW_LABELS: Record<ChartWindow, string> = {
  "1d": "1D",
  "7d": "7D",
  "30d": "30D",
};

export type ChartState =
  { kind: "loading" } | { kind: "ok"; data: ChartResponse } | { kind: "error"; error: ApiError };

export interface TradeViewProps {
  coinId: string;
  marketsState: MarketsState;
  chartState: ChartState;
  window: ChartWindow;
  onWindowChange: (window: ChartWindow) => void;
  now?: () => number;
}

// Pure view: the same pure-view/stateful-wrapper split every page in this
// repo uses, so every visual state is reachable from renderToStaticMarkup.
// PriceChart is rendered in exactly one place below (the full-render
// branch), and that branch is reached whenever chartState is "loading" OR
// "ok" (never only on "error") — the wrapper below never resets chartState
// back to "loading" once it has succeeded once, so PriceChart stays mounted
// continuously across every 1D/7D/30D window switch: one chart instance and
// one canvas survive every switch, with no stacked leftovers (D-37).
export function TradeView({
  coinId,
  marketsState,
  chartState,
  window,
  onWindowChange,
  now = Date.now,
}: TradeViewProps) {
  if (marketsState.kind === "loading") {
    return (
      <section>
        <h1>Trade</h1>
        <p>Loading…</p>
      </section>
    );
  }

  // T-03-21: the unknown-market branch is keyed on the error's code, never
  // on an echo of the raw coin id as markup — a coin id typed straight into
  // the address bar, or a pair that dropped out of the curated top twenty
  // since the page was last open, both surface here rather than as an
  // unhandled failure.
  const chartError = chartState.kind === "error" ? chartState.error : null;
  if (chartError?.code === "UNKNOWN_MARKET") {
    return (
      <section>
        <h1>Trade</h1>
        <p data-testid="unknown-market">This pair is not tradable here.</p>
        <Link to="/markets">Back to Markets</Link>
      </section>
    );
  }

  if (marketsState.kind === "error") {
    return (
      <section>
        <h1>Trade</h1>
        <p>
          Unable to load trade data.
          {marketsState.error.requestId ? (
            <span> Request ID: {marketsState.error.requestId}</span>
          ) : null}
        </p>
      </section>
    );
  }

  const pair = marketsState.data.pairs.find((candidate) => candidate.id === coinId);
  if (!pair) {
    return (
      <section>
        <h1>Trade</h1>
        <p data-testid="unknown-market">This pair is not tradable here.</p>
        <Link to="/markets">Back to Markets</Link>
      </section>
    );
  }

  if (chartError) {
    return (
      <section>
        <h1>Trade</h1>
        <p>
          Unable to load chart data.
          {chartError.requestId ? <span> Request ID: {chartError.requestId}</span> : null}
        </p>
      </section>
    );
  }

  const { fetchedAt, stale } = marketsState.data;
  const change = formatPercent(pair.change24hPct);

  return (
    <section>
      <h1>Trade</h1>
      <StaleBanner stale={stale} fetchedAt={fetchedAt} now={now} />
      <h2 data-testid="trade-pair">{pair.pair}</h2>
      <p data-testid="trade-price">{formatPrice(pair.price)}</p>
      <p data-testid="trade-change" data-direction={change.direction}>
        {change.text}
      </p>
      {/* D-36: restates the quote convention on this page too — Phase 4's
          order form lands on this page and inherits it. */}
      <p data-testid="quote-convention">
        Prices are CoinGecko&apos;s USD reference prices. This exchange treats {QUOTE_SYMBOL} as 1:1
        with USD.
      </p>
      <div role="group" aria-label="Chart window">
        {CHART_WINDOWS.map((candidateWindow) => (
          <button
            key={candidateWindow}
            type="button"
            data-window={candidateWindow}
            data-active={candidateWindow === window ? "true" : undefined}
            onClick={() => onWindowChange(candidateWindow)}
          >
            {WINDOW_LABELS[candidateWindow]}
          </button>
        ))}
      </div>
      {/* Only ever mounted once chartState has resolved for the first time
          (never on "loading", which after that first success never recurs —
          see the doc comment above) — every points array PriceChart ever
          receives is therefore already known non-empty (toChartPoints
          throws on an empty upstream body), so its own chart-ready sentinel
          only ever flips once a real series has actually drawn. */}
      {chartState.kind === "ok" ? (
        <PriceChart points={chartState.data.points} />
      ) : (
        <p data-testid="chart-loading">Loading chart…</p>
      )}
      {/* MKT-05/D-48: the trade page additionally attributes the chart
          series, alongside the prices attribution already on /markets and
          in the shell footer. The TradingView credit the chart library's
          own licence requires is rendered by the chart itself (its default
          attributionLogo option) — this line is the CoinGecko credit only. */}
      <p>
        Price and chart data provided by{" "}
        <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
          CoinGecko
        </a>
        .
      </p>
    </section>
  );
}

function createDocumentVisibilityAdapter(): VisibilityAdapter {
  return {
    isVisible: () => document.visibilityState === "visible",
    subscribe: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

export interface TradeProps {
  createPollerImpl?: typeof createMarketsPoller;
  fetchChart?: typeof realFetchMarketChart;
}

// Stateful wrapper: reads the coin id from the route, runs the markets
// poller so the header price and the stale flag stay live, and fetches the
// chart in an effect keyed on the coin id and the selected window with an
// abort controller cleanup. Deliberately never resets chartState back to
// "loading" once it has resolved once — see the doc comment on TradeView
// above for why that is what keeps PriceChart mounted continuously across a
// window switch instead of unmounting/remounting it.
export function Trade({ createPollerImpl = createMarketsPoller, fetchChart }: TradeProps = {}) {
  const params = useParams<{ id: string }>();
  const coinId = params.id ?? "";
  const [marketsState, setMarketsState] = useState<MarketsState>({ kind: "loading" });
  const [window, setWindow] = useState<ChartWindow>("1d");
  const [chartState, setChartState] = useState<ChartState>({ kind: "loading" });

  useEffect(() => {
    const poller = createPollerImpl({
      onUpdate: (next) => setMarketsState(next),
      visibility: createDocumentVisibilityAdapter(),
    });
    poller.start();

    return () => poller.stop();
  }, [createPollerImpl]);

  useEffect(() => {
    if (!coinId) return;
    const controller = new AbortController();
    const fetchImpl = fetchChart ?? realFetchMarketChart;

    fetchImpl(coinId, window, { signal: controller.signal }).then(
      (result) => {
        setChartState({ kind: "ok", data: result.data });
      },
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError) {
          setChartState({ kind: "error", error });
        }
      },
    );

    return () => controller.abort();
  }, [coinId, window, fetchChart]);

  return (
    <TradeView
      coinId={coinId}
      marketsState={marketsState}
      chartState={chartState}
      window={window}
      onWindowChange={setWindow}
    />
  );
}

export interface TradeIndexProps {
  fetchMarketsImpl?: typeof realFetchMarkets;
}

type TradeIndexState =
  { kind: "loading" } | { kind: "ok"; id: string } | { kind: "error"; error: ApiError };

// The bare /trade route's component: fetches the markets payload and
// redirects to the first curated pair's trade route. Never hardcodes a coin
// — the curated list is dynamic by D-36.
export function TradeIndex({ fetchMarketsImpl = realFetchMarkets }: TradeIndexProps = {}) {
  const [state, setState] = useState<TradeIndexState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetchMarketsImpl().then(
      (result: { data: MarketsResponse }) => {
        if (cancelled) return;
        const first = result.data.pairs[0];
        if (first) {
          setState({ kind: "ok", id: first.id });
        } else {
          setState({ kind: "error", error: new ApiError(null, "NO_MARKETS", null) });
        }
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError) {
          setState({ kind: "error", error });
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [fetchMarketsImpl]);

  if (state.kind === "loading") {
    return (
      <section>
        <h1>Trade</h1>
        <p>Loading…</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section>
        <h1>Trade</h1>
        <p>Unable to load markets.</p>
        <Link to="/markets">Back to Markets</Link>
      </section>
    );
  }

  return <Navigate to={`/trade/${state.id}`} replace />;
}
