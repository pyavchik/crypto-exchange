import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResult, type MarketsResponse } from "./api.js";
import {
  createMarketsPoller,
  MARKETS_POLL_INTERVAL_MS,
  type MarketsState,
} from "./marketsPoller.js";
import type { PollerTimers, VisibilityAdapter } from "./poller.js";

const MARKETS_BODY: MarketsResponse = {
  pairs: [
    {
      id: "bitcoin",
      symbol: "BTC",
      name: "Bitcoin",
      pair: "BTC/USDT",
      price: 65000,
      change24hPct: 1.2,
      volume24h: 500_000_000,
      marketCap: 1_200_000_000_000,
    },
  ],
  fetchedAt: "2026-09-16T09:14:20.000Z",
  stale: false,
};

interface FakeVisibility extends VisibilityAdapter {
  setVisible: (visible: boolean) => void;
}

function createFakeVisibility(initial: boolean): FakeVisibility {
  let visible = initial;
  let listener: (() => void) | null = null;
  return {
    isVisible: () => visible,
    subscribe: (l) => {
      listener = l;
      return () => {
        listener = null;
      };
    },
    setVisible(next: boolean) {
      visible = next;
      listener?.();
    },
  };
}

describe("MARKETS_POLL_INTERVAL_MS", () => {
  it("is 30 seconds (D-40)", () => {
    expect(MARKETS_POLL_INTERVAL_MS).toBe(30_000);
  });
});

describe("createMarketsPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches once on start and reports an ok state carrying the payload and the request id", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: "r-1",
    });
    const onUpdate = vi.fn<(state: MarketsState) => void>();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMarkets).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenLastCalledWith({
      kind: "ok",
      data: MARKETS_BODY,
      requestId: "r-1",
    });

    poller.stop();
  });

  it("schedules the next fetch 30 seconds after the previous one settles while visible", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(MARKETS_POLL_INTERVAL_MS - 1);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMarkets).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("does not fetch on start() while the tab starts hidden, but fetches once it becomes visible (WR-02)", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: "r-1",
    });
    const onUpdate = vi.fn<(state: MarketsState) => void>();
    const visibility = createFakeVisibility(false);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).not.toHaveBeenCalled();

    visibility.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    poller.stop();
  });

  it("performs no fetch and cancels any pending timer while the adapter reports hidden", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    poller.stop();
  });

  it("fetches immediately when visibility returns after more than 30s has elapsed since the last fetch started", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(45_000);
    visibility.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("schedules the remainder when visibility returns before 30s has elapsed since the last fetch started", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(10_000);
    visibility.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(19_999);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMarkets).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("an ApiError rejection produces an error state and still schedules the next poll", async () => {
    const apiError = new ApiError(502, "UPSTREAM_UNAVAILABLE", "req-1");
    const fetchMarkets = vi
      .fn<() => Promise<ApiResult<MarketsResponse>>>()
      .mockRejectedValueOnce(apiError)
      .mockResolvedValue({ data: MARKETS_BODY, requestId: null });
    const onUpdate = vi.fn<(state: MarketsState) => void>();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "error", error: apiError });

    await vi.advanceTimersByTimeAsync(MARKETS_POLL_INTERVAL_MS);
    expect(fetchMarkets).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("a non-ApiError rejection is rethrown rather than reported as an error state", async () => {
    const fetchMarkets = vi
      .fn<() => Promise<ApiResult<MarketsResponse>>>()
      .mockResolvedValueOnce({ data: MARKETS_BODY, requestId: null })
      .mockRejectedValueOnce(new TypeError("boom"))
      .mockResolvedValue({ data: MARKETS_BODY, requestId: null });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    await expect(poller.refresh()).rejects.toThrow("boom");
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    poller.stop();
  });

  it("an abort caused by stopping produces no state update", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchMarkets = vi.fn<
      (options?: { signal?: AbortSignal }) => Promise<ApiResult<MarketsResponse>>
    >(
      (opts) =>
        new Promise<ApiResult<MarketsResponse>>((_resolve, reject) => {
          capturedSignal = opts?.signal;
          opts?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    onUpdate.mockClear();
    poller.stop();

    expect(capturedSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("stop() cancels the timer, aborts any in-flight request and unsubscribes from visibility", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);

    poller.stop();
    await vi.advanceTimersByTimeAsync(MARKETS_POLL_INTERVAL_MS * 3);
    expect(fetchMarkets).toHaveBeenCalledTimes(1);
  });
});

// D-40/wiki/pages/findings/health-poller-illegal-invocation.md: the shared
// shape alone does not catch a receiver bug re-introduced at this layer, so
// the markets poller carries its own strict-receiver block even though it
// only ever delegates to already-covered code (03-RESEARCH.md).
describe("createMarketsPoller under the browser timer-receiver rule", () => {
  let strictSetTimeout: PollerTimers["setTimeout"];
  let strictClearTimeout: PollerTimers["clearTimeout"];

  beforeEach(() => {
    vi.useFakeTimers();
    const fakeSetTimeout = globalThis.setTimeout;
    const fakeClearTimeout = globalThis.clearTimeout;

    strictSetTimeout = function (this: unknown, handler: () => void, delayMs: number) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      return fakeSetTimeout(handler, delayMs);
    };
    strictClearTimeout = function (this: unknown, handle: ReturnType<typeof setTimeout>) {
      if (this !== undefined && this !== globalThis) {
        throw new TypeError("Illegal invocation");
      }
      fakeClearTimeout(handle);
    };

    vi.stubGlobal("setTimeout", strictSetTimeout);
    vi.stubGlobal("clearTimeout", strictClearTimeout);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("a start, a scheduled tick and a stop all succeed under the strict-receiver globals", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: "r-1",
    });
    const onUpdate = vi.fn<(state: MarketsState) => void>();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({ fetchMarkets, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      kind: "ok",
      data: MARKETS_BODY,
      requestId: "r-1",
    });
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(MARKETS_POLL_INTERVAL_MS);
    expect(fetchMarkets).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("injected strict-receiver timers still work end to end", async () => {
    const fetchMarkets = vi.fn<() => Promise<ApiResult<MarketsResponse>>>().mockResolvedValue({
      data: MARKETS_BODY,
      requestId: "r-1",
    });
    const onUpdate = vi.fn<(state: MarketsState) => void>();
    const visibility = createFakeVisibility(true);
    const poller = createMarketsPoller({
      fetchMarkets,
      onUpdate,
      visibility,
      timers: { setTimeout: strictSetTimeout, clearTimeout: strictClearTimeout },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      kind: "ok",
      data: MARKETS_BODY,
      requestId: "r-1",
    });

    await vi.advanceTimersByTimeAsync(MARKETS_POLL_INTERVAL_MS);
    expect(fetchMarkets).toHaveBeenCalledTimes(2);

    poller.stop();
  });
});
