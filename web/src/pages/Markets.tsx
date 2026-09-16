import { useEffect, useState } from "react";
import { ApiError, fetchMarkets as realFetchMarkets, type MarketsResponse } from "../lib/api.js";
import { formatCompact, formatPercent, formatPrice, QUOTE_SYMBOL } from "../lib/format.js";

export type MarketsState =
  | { kind: "loading" }
  | { kind: "ok"; data: MarketsResponse; requestId: string | null }
  | { kind: "error"; error: ApiError };

export interface MarketsViewProps {
  state: MarketsState;
}

// Pure view: renders only React text children (never raw HTML), so
// upstream-derived strings (coin name, symbol, pair label) can never inject
// markup — the same T-01-22 discipline HealthBadgeView documents. Every
// upstream-derived string here reaches the DOM only as a JSX text child.
export function MarketsView({ state }: MarketsViewProps) {
  if (state.kind === "loading") {
    return (
      <section>
        <h1>Markets</h1>
        <p>Loading markets…</p>
      </section>
    );
  }

  if (state.kind === "error") {
    return (
      <section>
        <h1>Markets</h1>
        <p>
          Unable to load markets.
          {state.error.requestId ? <span> Request ID: {state.error.requestId}</span> : null}
        </p>
      </section>
    );
  }

  const { pairs } = state.data;

  return (
    <section>
      <h1>Markets</h1>
      {/* D-36: prices are stated as CoinGecko's dollar reference prices plus
          this project's own 1:1 stablecoin-peg display convention, so a
          reviewer is not misled into believing a genuinely stablecoin-quoted
          feed exists. */}
      <p data-testid="quote-convention">
        Prices are CoinGecko&apos;s USD reference prices. This exchange treats {QUOTE_SYMBOL} as
        1:1 with USD.
      </p>
      <table data-testid="markets-table">
        <thead>
          <tr>
            <th>Pair</th>
            <th>Price</th>
            <th>24h %</th>
            <th>24h Volume</th>
            <th>Market Cap</th>
          </tr>
        </thead>
        <tbody>
          {pairs.map((pair) => {
            const change = formatPercent(pair.change24hPct);
            return (
              <tr key={pair.id} data-testid="markets-row" data-coin-id={pair.id}>
                <td>{pair.pair}</td>
                <td>{formatPrice(pair.price)}</td>
                <td data-direction={change.direction}>{change.text}</td>
                <td>{formatCompact(pair.volume24h)}</td>
                <td>{formatCompact(pair.marketCap)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export interface MarketsProps {
  fetchMarketsImpl?: typeof realFetchMarkets;
}

// Runs a single fetch on mount with an AbortController cleanup. Does not
// poll — D-40's visibility-aware 30s poller and the "last updated" line
// arrive in 03-03, which replaces this one-shot load. The fetch function is
// injectable so the wrapper stays testable without a real network call.
export function Markets({ fetchMarketsImpl = realFetchMarkets }: MarketsProps = {}) {
  const [state, setState] = useState<MarketsState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetchMarketsImpl({ signal: controller.signal }).then(
      (result) => {
        setState({ kind: "ok", data: result.data, requestId: result.requestId });
      },
      (error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (error instanceof ApiError) {
          setState({ kind: "error", error });
          return;
        }
        // Not an ApiError: a programming error, not an API failure — never
        // disguise it as one (mirrors healthPoller.ts's discipline).
        throw error;
      },
    );

    return () => controller.abort();
  }, [fetchMarketsImpl]);

  return <MarketsView state={state} />;
}
