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
  // D-27: per-field validation detail. Defaults to null so every existing
  // three-arg call site (and every non-VALIDATION_ERROR response) is
  // unaffected.
  fields: Record<string, string> | null;

  constructor(
    status: number | null,
    code: string,
    requestId: string | null,
    fields: Record<string, string> | null = null,
  ) {
    super(`API error: ${code}`);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.fields = fields;
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

// Shared parse path for every JSON 2xx body: a response that fails to parse
// as JSON surfaces as ApiError INVALID_RESPONSE_BODY, matching fetchHealth's
// contract above rather than throwing a raw SyntaxError.
async function parseJsonBody<T>(
  response: Response,
  headerRequestId: string | null,
): Promise<ApiResult<T>> {
  let data: T;
  try {
    data = (await response.json()) as T;
  } catch {
    throw new ApiError(response.status, "INVALID_RESPONSE_BODY", headerRequestId);
  }
  return { data, requestId: headerRequestId };
}

function parseSessionResponse(
  response: Response,
  headerRequestId: string | null,
): Promise<ApiResult<SessionResponse>> {
  return parseJsonBody<SessionResponse>(response, headerRequestId);
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

// credentials: "include" for the same reason as signup — the session cookie
// must leave the browser on the cross-origin call.
export async function login(
  input: { email: string; password: string },
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<SessionResponse>> {
  const { signal, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/login`, {
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

export interface LogoutResponse {
  ok: boolean;
}

// D-18: the server treats logout as idempotent and always returns 200, but
// the client still guards the fetch/parse paths the same way every other
// call here does — a network failure or malformed body must still surface as
// ApiError, not throw a raw error the caller doesn't expect.
export async function logout(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<LogoutResponse>> {
  const { signal, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/logout`, {
      method: "POST",
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
  return parseJsonBody<LogoutResponse>(response, headerRequestId);
}

export interface WalletResponse {
  balances: Balance[];
}

export async function fetchWallet(
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<ApiResult<WalletResponse>> {
  const { signal, fetchImpl = fetch } = options;

  let response: Response;
  try {
    response = await fetchImpl(`${API_BASE_URL}/api/wallet`, { credentials: "include", signal });
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
  return parseJsonBody<WalletResponse>(response, headerRequestId);
}

interface ErrorResponseBody {
  error?: { code?: unknown; message?: unknown; requestId?: unknown; fields?: unknown };
}

// D-27: validates the optional fields member's shape (an object of string
// values) before trusting it, the same discipline the surrounding parser
// already applies to code/requestId. Any other shape (array, non-string
// value, non-object) is treated as absent rather than partially trusted.
function parseFields(raw: unknown): Record<string, string> | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0 || !entries.every(([, value]) => typeof value === "string")) {
    return null;
  }
  return Object.fromEntries(entries) as Record<string, string>;
}

// D-09: error responses use { error: { code, message, requestId, fields? } }.
// Falls back to a synthetic HTTP_<status> code (and the response header's
// request id) when the body is missing, non-JSON, or lacks a string error.code.
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
      const fields = parseFields(body.error?.fields);
      const apiError = new ApiError(response.status, code, requestId, fields);
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
