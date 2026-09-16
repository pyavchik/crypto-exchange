import type { ApiResult, HealthResponse } from "./api.js";
import {
  createPoller,
  type Poller,
  type PollerState,
  type PollerTimers,
  type VisibilityAdapter,
} from "./poller.js";

// D-02: poll GET /health on load and every 60s, but only while the tab is
// visible.
export const HEALTH_POLL_INTERVAL_MS = 60_000;

export type HealthState = PollerState<HealthResponse>;

// Re-exported so no existing import path breaks — these types now live in
// poller.ts, the single shared, receiver-safe polling implementation.
export type { VisibilityAdapter, PollerTimers };

export type HealthPoller = Poller;

export interface CreateHealthPollerOptions {
  fetchHealth: (options?: { signal?: AbortSignal }) => Promise<ApiResult<HealthResponse>>;
  onUpdate: (state: HealthState) => void;
  visibility: VisibilityAdapter;
  intervalMs?: number;
  now?: () => number;
  timers?: PollerTimers;
}

export function createHealthPoller(options: CreateHealthPollerOptions): HealthPoller {
  const {
    fetchHealth,
    onUpdate,
    visibility,
    intervalMs = HEALTH_POLL_INTERVAL_MS,
    now,
    timers,
  } = options;

  return createPoller<HealthResponse>({
    fetchImpl: fetchHealth,
    onUpdate,
    visibility,
    intervalMs,
    now,
    timers,
  });
}
