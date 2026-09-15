import type { ApiError, ApiResult, HealthResponse } from "./api.js";

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

export interface CreateHealthPollerOptions {
  fetchHealth: (options?: { signal?: AbortSignal }) => Promise<ApiResult<HealthResponse>>;
  onUpdate: (state: HealthState) => void;
  visibility: VisibilityAdapter;
  intervalMs?: number;
  now?: () => number;
  timers?: {
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
  };
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
    timers = { setTimeout, clearTimeout },
  } = options;

  let stopped = true;
  let checking = false;
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let lastFetchStartedAt: number | null = null;
  let unsubscribe: (() => void) | null = null;
  let inFlight: Promise<void> | null = null;

  function clearTimer(): void {
    if (timerId !== null) {
      timers.clearTimeout(timerId);
      timerId = null;
    }
  }

  function scheduleFromNow(delay: number): void {
    clearTimer();
    timerId = timers.setTimeout(() => {
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

  function performFetch(): Promise<void> {
    if (stopped) return Promise.resolve();
    clearTimer();
    checking = true;
    const abortController = new AbortController();
    controller = abortController;
    lastFetchStartedAt = now();

    const promise = fetchHealth({ signal: abortController.signal })
      .then((result) => {
        controller = null;
        checking = false;
        if (stopped) return;
        onUpdate({ kind: "ok", data: result.data, requestId: result.requestId });
        afterSettled();
      })
      .catch((error: unknown) => {
        controller = null;
        checking = false;
        if (stopped) return;
        if (isAbortError(error)) return;
        onUpdate({ kind: "error", error: error as ApiError });
        afterSettled();
      });

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
