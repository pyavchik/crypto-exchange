import { useEffect, useState } from "react";
import type { MarketsResponse } from "../lib/api.js";
import {
  formatCompact,
  formatPercent,
  formatPrice,
  formatUpdatedAt,
  QUOTE_SYMBOL,
} from "../lib/format.js";
import {
  filterMarkets,
  nextSortState,
  sortMarkets,
  type SortKey,
  type SortState,
} from "../lib/marketsTable.js";
import { createMarketsPoller, type MarketsState } from "../lib/marketsPoller.js";
import type { VisibilityAdapter } from "../lib/poller.js";
import { StaleBanner } from "../components/StaleBanner.js";

export type { MarketsState };
export type { MarketsResponse };

const SORT_LABELS: Record<SortKey, string> = {
  price: "Price",
  change24hPct: "24h %",
  volume24h: "24h Volume",
};

export interface MarketsViewProps {
  state: MarketsState;
  query: string;
  sort: SortState;
  onQueryChange: (query: string) => void;
  onSortChange: (key: SortKey) => void;
  now?: () => number;
}

// Pure view: renders only React text children (never raw HTML), so
// upstream-derived strings (coin name, symbol, pair label) can never inject
// markup — the same T-01-22 discipline HealthBadgeView documents. Every
// upstream-derived string here reaches the DOM only as a JSX text child.
// The rendered rows are always a derived value (filter, then sort) over the
// payload's own pairs — never stored state — so a fresh poll never drifts
// out of sync with what is on screen.
export function MarketsView({
  state,
  query,
  sort,
  onQueryChange,
  onSortChange,
  now = Date.now,
}: MarketsViewProps) {
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

  const { pairs, fetchedAt, stale } = state.data;
  const rows = sortMarkets(filterMarkets(pairs, query), sort);

  function sortHeader(key: SortKey) {
    const active = sort.key === key;
    return (
      <button
        type="button"
        data-sort-key={key}
        data-sort-direction={active ? sort.direction : undefined}
        onClick={() => onSortChange(key)}
      >
        {SORT_LABELS[key]}
      </button>
    );
  }

  return (
    <section>
      <h1>Markets</h1>
      <StaleBanner stale={stale} fetchedAt={fetchedAt} now={now} />
      {/* D-36: prices are stated as CoinGecko's dollar reference prices plus
          this project's own 1:1 stablecoin-peg display convention, so a
          reviewer is not misled into believing a genuinely stablecoin-quoted
          feed exists. */}
      <p data-testid="quote-convention">
        Prices are CoinGecko&apos;s USD reference prices. This exchange treats {QUOTE_SYMBOL} as 1:1
        with USD.
      </p>
      {/* MKT-05/D-48: attribution on the page itself, in addition to the
          shell footer's "Powered by CoinGecko" link. */}
      <p>
        Market data provided by{" "}
        <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
          CoinGecko
        </a>
        .
      </p>
      <div>
        <label htmlFor="markets-search-input">Search by name or symbol</label>
        <input
          id="markets-search-input"
          data-testid="markets-search"
          type="search"
          placeholder="Search by name or symbol"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      {/* D-40: reports the age of the data itself (the payload's own
          fetchedAt), never the time of the local request — a poll that
          fails leaves the previous payload on screen, and a
          locally-generated timestamp would then claim freshness the data
          does not have. */}
      <p data-testid="markets-updated">Last updated {formatUpdatedAt(fetchedAt, now())}</p>
      <table data-testid="markets-table">
        <thead>
          <tr>
            <th>Pair</th>
            <th>{sortHeader("price")}</th>
            <th>{sortHeader("change24hPct")}</th>
            <th>{sortHeader("volume24h")}</th>
            <th>Market Cap</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5}>No markets match &quot;{query}&quot;.</td>
            </tr>
          ) : (
            rows.map((pair) => {
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
            })
          )}
        </tbody>
      </table>
    </section>
  );
}

export interface MarketsProps {
  createPollerImpl?: typeof createMarketsPoller;
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

// D-40: replaces the tracer's one-shot fetch with the 30s visibility-aware
// poller. The poller factory is injectable so tests can drive states
// without real timers. Query and sort state are never reset by a fresh
// poll — a refresh landing while someone is reading a filtered, sorted
// table must not throw away what they were looking at.
export function Markets({ createPollerImpl = createMarketsPoller }: MarketsProps = {}) {
  const [state, setState] = useState<MarketsState>({ kind: "loading" });
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortState>({ key: null, direction: "desc" });

  useEffect(() => {
    const poller = createPollerImpl({
      onUpdate: (next) => setState(next),
      visibility: createDocumentVisibilityAdapter(),
    });
    poller.start();

    return () => poller.stop();
  }, [createPollerImpl]);

  return (
    <MarketsView
      state={state}
      query={query}
      sort={sort}
      onQueryChange={setQuery}
      onSortChange={(key) => setSort((current) => nextSortState(current, key))}
    />
  );
}
