import { fetchMarkets as realFetchMarkets, type ApiResult, type MarketsResponse } from "./api.js";
import {
  createPoller,
  type Poller,
  type PollerState,
  type PollerTimers,
  type VisibilityAdapter,
} from "./poller.js";

// D-40: the FE polls our own API every 30 seconds while the tab is visible.
// This poller only ever calls our own API — the browser never talks to
// CoinGecko directly — which is what makes the server-side 45s TTL cache
// (api/src/lib/marketData.ts) the thing that actually bounds upstream
// calls, not this interval.
export const MARKETS_POLL_INTERVAL_MS = 30_000;

export type MarketsState = PollerState<MarketsResponse>;

export interface CreateMarketsPollerOptions {
  fetchMarkets?: (options?: { signal?: AbortSignal }) => Promise<ApiResult<MarketsResponse>>;
  onUpdate: (state: MarketsState) => void;
  visibility: VisibilityAdapter;
  intervalMs?: number;
  now?: () => number;
  timers?: PollerTimers;
}

export function createMarketsPoller(options: CreateMarketsPollerOptions): Poller {
  const {
    fetchMarkets = realFetchMarkets,
    onUpdate,
    visibility,
    intervalMs = MARKETS_POLL_INTERVAL_MS,
    now,
    timers,
  } = options;

  return createPoller<MarketsResponse>({
    fetchImpl: fetchMarkets,
    onUpdate,
    visibility,
    intervalMs,
    now,
    timers,
  });
}
