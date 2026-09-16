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

  const headerRequestId = response.headers.get("x-request-id");

  if (!response.ok) {
    throw await parseErrorResponse(response, headerRequestId);
  }

  // D-09, REVIEW WR-01: a 2xx response with a malformed/truncated body must
  // still surface as an ApiError, not a raw SyntaxError — otherwise the
  // fetchHealth contract ("every failure rejects with ApiError or AbortError")
  // is silently violated for this one path. Never copy the raw body into the
  // error.
  let data: HealthResponse;
  try {
    data = (await response.json()) as HealthResponse;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
  }
  return { data, requestId: headerRequestId };
}

export interface Balance {
  asset: string;
  amount: string;
}

export interface SessionResponse {
  email: string;
  balances: Balance[];
}

// Shared parse path for both signup and fetchMe: a 2xx body that fails to
// parse as JSON surfaces as ApiError INVALID_RESPONSE_BODY, matching
// fetchHealth's contract above rather than throwing a raw SyntaxError.
async function parseSessionResponse(
  response: Response,
  headerRequestId: string | null,
): Promise<ApiResult<SessionResponse>> {
  let data: SessionResponse;
  try {
    data = (await response.json()) as SessionResponse;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
  }
  return { data, requestId: headerRequestId };
}

// credentials: "include" is what makes the browser attach the session cookie
// on the cross-origin localhost:5173 -> localhost:3000 call at all — without
// it the cookie never leaves the browser (D-16/D-17, 02-RESEARCH.md Pattern 5).
export async function signup(
  input: { email: string; password: string },
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<SessionResponse>> {
  const { signal, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/signup`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      credentials: "include",
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(null, "NETWORK_ERROR", null);
  }

  const headerRequestId = response.headers.get("x-request-id");
  if (!response.ok) {
    throw await parseErrorResponse(response, headerRequestId);
  }
  return parseSessionResponse(response, headerRequestId);
}

export async function fetchMe(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<SessionResponse>> {
  const { signal, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/me`, { credentials: "include", signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw error;
    }
    throw new ApiError(null, "NETWORK_ERROR", null);
  }

  const headerRequestId = response.headers.get("x-request-id");
  if (!response.ok) {
    throw await parseErrorResponse(response, headerRequestId);
  }
  return parseSessionResponse(response, headerRequestId);
}

interface ErrorResponseBody {
  error?: { code?: unknown; message?: unknown; requestId?: unknown };
}

// D-09: error responses use { error: { code, message, requestId } }. Falls
// back to a synthetic HTTP_<status> code (and the response header's request
// id) when the body is missing, non-JSON, or lacks a string error.code.
async function parseErrorResponse(
  response: Response,
  headerRequestId: string | null,
): Promise<ApiError> {
  try {
    const body = (await response.json()) as ErrorResponseBody;
    const code = body.error?.code;
    if (typeof code === "string") {
      const requestId =
        typeof body.error?.requestId === "string" ? body.error.requestId : headerRequestId;
      const apiError = new ApiError(response.status, code, requestId);
      if (typeof body.error?.message === "string") {
        apiError.message = body.error.message;
      }
      return apiError;
    }
  } catch {
    // Non-JSON or unparsable body — fall through to the generic HTTP_<status> code.
  }
  return new ApiError(response.status, `HTTP_${response.status}`, headerRequestId);
}
