import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResult, type HealthResponse } from "./api.js";
import {
  createHealthPoller,
  HEALTH_POLL_INTERVAL_MS,
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
