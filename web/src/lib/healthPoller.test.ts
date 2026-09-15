import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResult, type HealthResponse } from "./api.js";
import {
  createHealthPoller,
  HEALTH_POLL_INTERVAL_MS,
  type PollerTimers,
  type VisibilityAdapter,
} from "./healthPoller.js";

const HEALTH_BODY: HealthResponse = {
  status: "ok",
  version: "0.1.0",
  commit: "dev",
  upstream: { coingecko: { status: "ok", checkedAt: "2026-09-15T00:00:00.000Z", latencyMs: 42 } },
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

describe("createHealthPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches immediately on start and again after 60s while visible", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: "r-1",
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: HEALTH_BODY, requestId: "r-1" });

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_INTERVAL_MS);
    expect(fetchHealth).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("makes no further call while the tab stays hidden", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    poller.stop();
  });

  it("fetches immediately when the tab becomes visible 90s after the last fetch started", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(90_000);
    visibility.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("waits the remaining interval when the tab becomes visible 20s after the last fetch started", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(20_000);
    visibility.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetchHealth).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("refresh() while idle makes one immediate call and restarts the 60s schedule from it", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await poller.refresh();
    expect(fetchHealth).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetchHealth).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchHealth).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("refresh() twice while the first fetch is pending starts exactly one request", async () => {
    let resolveFetch: (value: ApiResult<HealthResponse>) => void = () => {};
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>(
      () =>
        new Promise<ApiResult<HealthResponse>>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    void poller.refresh();
    void poller.refresh();
    expect(fetchHealth).toHaveBeenCalledTimes(1);

    resolveFetch({ data: HEALTH_BODY, requestId: null });
    await vi.advanceTimersByTimeAsync(0);

    poller.stop();
  });

  it("emits an error state and keeps polling when fetchHealth rejects with an ApiError", async () => {
    const apiError = new ApiError(500, "INTERNAL_ERROR", "req-123");
    const fetchHealth = vi
      .fn<() => Promise<ApiResult<HealthResponse>>>()
      .mockRejectedValueOnce(apiError)
      .mockResolvedValue({ data: HEALTH_BODY, requestId: null });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "error", error: apiError });

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_INTERVAL_MS);
    expect(fetchHealth).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("an exception from onUpdate after a successful fetch propagates and is not reported as an error state", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: null,
    });
    const onUpdate = vi
      .fn()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw new Error("render bug");
      });
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(poller.refresh()).rejects.toThrow("render bug");
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_INTERVAL_MS);
    expect(fetchHealth).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("a non-ApiError rejection from fetchHealth is rethrown, not rendered", async () => {
    const fetchHealth = vi
      .fn<() => Promise<ApiResult<HealthResponse>>>()
      .mockResolvedValueOnce({ data: HEALTH_BODY, requestId: null })
      .mockRejectedValueOnce(new TypeError("boom"))
      .mockResolvedValue({ data: HEALTH_BODY, requestId: null });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    await expect(poller.refresh()).rejects.toThrow("boom");
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_INTERVAL_MS);
    expect(fetchHealth).toHaveBeenCalledTimes(3);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: HEALTH_BODY, requestId: null });

    poller.stop();
  });

  it("stop() aborts the in-flight request, clears the timer and unsubscribes, with no update afterwards", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchHealth = vi.fn<
      (options?: { signal?: AbortSignal }) => Promise<ApiResult<HealthResponse>>
    >(
      (opts) =>
        new Promise<ApiResult<HealthResponse>>((_resolve, reject) => {
          capturedSignal = opts?.signal;
          opts?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    onUpdate.mockClear();
    poller.stop();

    expect(capturedSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(fetchHealth).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

// Browsers throw `TypeError: Illegal invocation` when a native timer
// function is called with a non-window receiver (WebIDL "this" check).
// Node's setTimeout/clearTimeout have no such check, so these tests stub
// the globals with a strict-receiver shim that reproduces the browser rule
// inside Vitest. See wiki/pages/findings/health-poller-illegal-invocation.md.
describe("createHealthPoller under the browser timer-receiver rule", () => {
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

  it("default timers work when the global timer functions reject a non-global receiver", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: "r-1",
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: HEALTH_BODY, requestId: "r-1" });
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_INTERVAL_MS);
    expect(fetchHealth).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("injected timer functions are invoked without a receiver", async () => {
    const fetchHealth = vi.fn<() => Promise<ApiResult<HealthResponse>>>().mockResolvedValue({
      data: HEALTH_BODY,
      requestId: "r-1",
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({
      fetchHealth,
      onUpdate,
      visibility,
      timers: { setTimeout: strictSetTimeout, clearTimeout: strictClearTimeout },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: HEALTH_BODY, requestId: "r-1" });
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(HEALTH_POLL_INTERVAL_MS);
    expect(fetchHealth).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("refresh() recovers from an error state to ok under the browser receiver rule", async () => {
    const fetchHealth = vi
      .fn<() => Promise<ApiResult<HealthResponse>>>()
      .mockRejectedValueOnce(new ApiError(null, "NETWORK_ERROR", null))
      .mockResolvedValue({ data: HEALTH_BODY, requestId: null });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createHealthPoller({ fetchHealth, onUpdate, visibility });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      kind: "error",
      error: expect.any(ApiError),
    });

    await poller.refresh();
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: HEALTH_BODY, requestId: null });

    poller.stop();
  });
});
