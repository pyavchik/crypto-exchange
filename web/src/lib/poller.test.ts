import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, type ApiResult } from "./api.js";
import { createPoller, type PollerTimers, type VisibilityAdapter } from "./poller.js";

// Generic behavior suite for the shared, receiver-safe poller implementation
// (see web/src/lib/healthPoller.test.ts for the origin of this harness shape
// and wiki/pages/findings/health-poller-illegal-invocation.md for why the
// strict-receiver block at the bottom of this file exists). Uses a small
// payload type so the suite proves the implementation generically, not
// tied to any one consumer's payload shape.

interface TestPayload {
  value: string;
}

const PAYLOAD: TestPayload = { value: "ok" };
const INTERVAL_MS = 60_000;

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

describe("createPoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches immediately on start and again after the interval while visible", async () => {
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>().mockResolvedValue({
      data: PAYLOAD,
      requestId: "r-1",
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: PAYLOAD, requestId: "r-1" });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("makes no further call while the tab stays hidden, and cancels the pending timer", async () => {
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>().mockResolvedValue({
      data: PAYLOAD,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    poller.stop();
  });

  it("fetches immediately when the tab becomes visible after more than the interval has elapsed", async () => {
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>().mockResolvedValue({
      data: PAYLOAD,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(90_000);
    visibility.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("waits the remaining interval when the tab becomes visible before the interval has elapsed", async () => {
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>().mockResolvedValue({
      data: PAYLOAD,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    visibility.setVisible(false);
    await vi.advanceTimersByTimeAsync(20_000);
    visibility.setVisible(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(40_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("refresh() while idle makes one immediate call and restarts the schedule from it", async () => {
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>().mockResolvedValue({
      data: PAYLOAD,
      requestId: null,
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    await poller.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    poller.stop();
  });

  it("refresh() twice while the first fetch is pending starts exactly one request", async () => {
    let resolveFetch: (value: ApiResult<TestPayload>) => void = () => {};
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>(
      () =>
        new Promise<ApiResult<TestPayload>>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    void poller.refresh();
    void poller.refresh();
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resolveFetch({ data: PAYLOAD, requestId: null });
    await vi.advanceTimersByTimeAsync(0);

    poller.stop();
  });

  it("emits an error state and keeps polling when the fetch rejects with an ApiError", async () => {
    const apiError = new ApiError(500, "INTERNAL_ERROR", "req-123");
    const fetchImpl = vi
      .fn<() => Promise<ApiResult<TestPayload>>>()
      .mockRejectedValueOnce(apiError)
      .mockResolvedValue({ data: PAYLOAD, requestId: null });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "error", error: apiError });

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("a non-ApiError rejection is rethrown rather than reported as an error state", async () => {
    const fetchImpl = vi
      .fn<() => Promise<ApiResult<TestPayload>>>()
      .mockResolvedValueOnce({ data: PAYLOAD, requestId: null })
      .mockRejectedValueOnce(new TypeError("boom"))
      .mockResolvedValue({ data: PAYLOAD, requestId: null });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    await expect(poller.refresh()).rejects.toThrow("boom");
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: PAYLOAD, requestId: null });

    poller.stop();
  });

  it("stop() aborts the in-flight request, clears the timer and unsubscribes, with no update after and no fetch produces an update", async () => {
    let capturedSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn<
      (options?: { signal?: AbortSignal }) => Promise<ApiResult<TestPayload>>
    >(
      (opts) =>
        new Promise<ApiResult<TestPayload>>((_resolve, reject) => {
          capturedSignal = opts?.signal;
          opts?.signal?.addEventListener("abort", () => {
            reject(new DOMException("aborted", "AbortError"));
          });
        }),
    );
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    onUpdate.mockClear();
    poller.stop();

    expect(capturedSignal?.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(200_000);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(onUpdate).not.toHaveBeenCalled();
  });
});

// Browsers throw `TypeError: Illegal invocation` when a native timer
// function is called with a non-window receiver (WebIDL "this" check).
// Node's setTimeout/clearTimeout have no such check, so these tests stub
// the globals with a strict-receiver shim that reproduces the browser rule
// inside Vitest — the shared implementation is the one place this fix must
// hold, since every consumer (health, markets) delegates to it. See
// wiki/pages/findings/health-poller-illegal-invocation.md.
describe("createPoller under the browser timer-receiver rule", () => {
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
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>().mockResolvedValue({
      data: PAYLOAD,
      requestId: "r-1",
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: PAYLOAD, requestId: "r-1" });
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("injected timer functions are invoked without a receiver", async () => {
    const fetchImpl = vi.fn<() => Promise<ApiResult<TestPayload>>>().mockResolvedValue({
      data: PAYLOAD,
      requestId: "r-1",
    });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
      timers: { setTimeout: strictSetTimeout, clearTimeout: strictClearTimeout },
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: PAYLOAD, requestId: "r-1" });
    expect(onUpdate).not.toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));

    await vi.advanceTimersByTimeAsync(INTERVAL_MS);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    poller.stop();
  });

  it("refresh() recovers from an error state to ok under the browser receiver rule", async () => {
    const fetchImpl = vi
      .fn<() => Promise<ApiResult<TestPayload>>>()
      .mockRejectedValueOnce(new ApiError(null, "NETWORK_ERROR", null))
      .mockResolvedValue({ data: PAYLOAD, requestId: null });
    const onUpdate = vi.fn();
    const visibility = createFakeVisibility(true);
    const poller = createPoller<TestPayload>({
      fetchImpl,
      onUpdate,
      visibility,
      intervalMs: INTERVAL_MS,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(onUpdate).toHaveBeenLastCalledWith({
      kind: "error",
      error: expect.any(ApiError),
    });

    await poller.refresh();
    expect(onUpdate).toHaveBeenLastCalledWith({ kind: "ok", data: PAYLOAD, requestId: null });

    poller.stop();
  });
});
