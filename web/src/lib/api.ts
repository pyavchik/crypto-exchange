export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

// Mirrors api/src/routes/health.ts — kept in sync manually until a shared
// types package exists (Out of Scope for Phase 1, see SKELETON.md).
export type UpstreamStatus = "ok" | "degraded" | "down" | "not_configured";

export interface UpstreamCheck {
  status: UpstreamStatus;
  checkedAt: string | null;
  latencyMs: number | null;
}

export interface HealthResponse {
  status: "ok";
  version: string;
  commit: string;
  upstream: { coingecko: UpstreamCheck };
}

export interface ApiResult<T> {
  data: T;
  requestId: string | null;
}

export class ApiError extends Error {
  status: number | null;
  code: string;
  requestId: string | null;

  constructor(status: number | null, code: string, requestId: string | null) {
    super(`API error: ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

export async function fetchHealth(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<HealthResponse>> {
  const { signal, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/health`, { signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(null, "NETWORK_ERROR", null);
  }

  const requestId = response.headers.get("x-request-id");

  if (!response.ok) {
    throw new ApiError(response.status, `HTTP_${response.status}`, requestId);
  }

  const data = (await response.json()) as HealthResponse;
  return { data, requestId };
}
