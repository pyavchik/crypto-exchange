import { ApiError, type ApiResult, type HealthResponse } from "./api.js";

// D-02: poll GET /health on load and every 60s, but only while the tab is
// visible.
export const HEALTH_POLL_INTERVAL_MS = 60_000;

export type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; data: HealthResponse; requestId: string | null }
  | { kind: "error"; error: ApiError };

export interface VisibilityAdapter {
  isVisible(): boolean;
  subscribe(listener: () => void): () => void;
}

export interface HealthPoller {
  start(): void;
  stop(): void;
  refresh(): Promise<void>;
  isChecking(): boolean;
}

// The type timerId already uses. `typeof setTimeout`/`typeof clearTimeout`
// cannot be reused directly for PollerTimers because the Node typings add a
// promisify member, which arrow-function wrappers cannot satisfy.
type TimerHandle = ReturnType<typeof setTimeout>;

export interface PollerTimers {
  setTimeout(handler: () => void, delayMs: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
}

export interface CreateHealthPollerOptions {
  fetchHealth: (options?: { signal?: AbortSignal }) => Promise<ApiResult<HealthResponse>>;
  onUpdate: (state: HealthState) => void;
  visibility: VisibilityAdapter;
  intervalMs?: number;
  now?: () => number;
  timers?: PollerTimers;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createHealthPoller(options: CreateHealthPollerOptions): HealthPoller {
  const {
    fetchHealth,
    onUpdate,
    visibility,
    intervalMs = HEALTH_POLL_INTERVAL_MS,
    now = Date.now,
    timers = {
      // Bare (unqualified) calls to the global functions, looked up lazily
      // at call time -> the receiver is undefined, never this object. See
      // the comment on scheduleTimeout/cancelTimeout below for why that
      // matters.
      setTimeout: (handler: () => void, delayMs: number) => setTimeout(handler, delayMs),
      clearTimeout: (handle: TimerHandle) => clearTimeout(handle),
    },
  } = options;

  // Browsers throw `TypeError: Illegal invocation` when a native timer
  // function is invoked with a non-window receiver (WebIDL "this" check);
  // Node has no such check. Copying the two functions out of `timers` here
  // and calling only these locals (never `timers.setTimeout(...)` /
  // `timers.clearTimeout(...)`) guarantees every call is an unqualified
  // plain call, so the receiver is always undefined. See
  // wiki/pages/findings/health-poller-illegal-invocation.md.
  const scheduleTimeout = timers.setTimeout;
  const cancelTimeout = timers.clearTimeout;

  let stopped = true;
  let checking = false;
  let timerId: TimerHandle | null = null;
  let controller: AbortController | null = null;
  let lastFetchStartedAt: number | null = null;
  let unsubscribe: (() => void) | null = null;
  let inFlight: Promise<void> | null = null;

  function clearTimer(): void {
    if (timerId !== null) {
      cancelTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleFromNow(delay: number): void {
    clearTimer();
    timerId = scheduleTimeout(() => {
      timerId = null;
      void performFetch();
    }, delay);
  }

  function afterSettled(): void {
    if (stopped) return;
    if (visibility.isVisible()) {
      scheduleFromNow(intervalMs);
    } else {
      clearTimer();
    }
  }

  // A single `.then(fulfilled, rejected)` call, not `.then().catch()`: an
  // exception thrown while handling a successful result can then never reach
  // the rejected handler (a chained `.catch()` would catch it, which is how
  // a programming error became "API unreachable" — REVIEW WR-02). Exceptions
  // from onUpdate, from rescheduling, and non-ApiError rejections all
  // propagate out of the promise this function returns. start(), the timer
  // callback and the visibility listener discard that promise with `void`,
  // so the browser reports them as unhandled rejections in the console
  // instead of hiding them behind the "API unreachable" badge.
  function performFetch(): Promise<void> {
    if (stopped) return Promise.resolve();
    clearTimer();
    checking = true;
    const abortController = new AbortController();
    controller = abortController;
    lastFetchStartedAt = now();

    const promise = fetchHealth({ signal: abortController.signal }).then(
      (result) => {
        controller = null;
        checking = false;
        if (stopped) return;
        try {
          onUpdate({ kind: "ok", data: result.data, requestId: result.requestId });
        } finally {
          afterSettled();
        }
      },
      (error: unknown) => {
        controller = null;
        checking = false;
        if (stopped) return;
        if (isAbortError(error)) return;
        if (error instanceof ApiError) {
          try {
            onUpdate({ kind: "error", error });
          } finally {
            afterSettled();
          }
          return;
        }
        // Not an ApiError: a programming error (e.g. a bug in fetchHealth
        // itself), not a network/API failure. Reschedule the next poll, but
        // never disguise this as an error state.
        afterSettled();
        throw error;
      },
    );

    inFlight = promise;
    return promise;
  }

  function onVisibilityChange(): void {
    if (stopped) return;
    if (visibility.isVisible()) {
      if (checking) return;
      const elapsed =
        lastFetchStartedAt === null ? Number.POSITIVE_INFINITY : now() - lastFetchStartedAt;
      if (elapsed >= intervalMs) {
        void performFetch();
      } else {
        scheduleFromNow(intervalMs - elapsed);
      }
    } else {
      clearTimer();
    }
  }

  return {
    start(): void {
      stopped = false;
      unsubscribe = visibility.subscribe(onVisibilityChange);
      void performFetch();
    },
    stop(): void {
      stopped = true;
      clearTimer();
      if (controller) {
        controller.abort();
        controller = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
    refresh(): Promise<void> {
      if (checking && inFlight) return inFlight;
      return performFetch();
    },
    isChecking(): boolean {
      return checking;
    },
  };
}
