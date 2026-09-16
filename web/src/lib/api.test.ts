import { describe, expect, it } from "vitest";
import {
  ApiError,
  fetchHealth,
  fetchMarketChart,
  fetchWallet,
  login,
  logout,
  type ChartResponse,
  type HealthResponse,
} from "./api.js";

const HEALTH_BODY: HealthResponse = {
  status: "ok",
  version: "0.1.0",
  commit: "dev",
  upstream: { coingecko: { status: "ok", checkedAt: "2026-09-15T00:00:00.000Z", latencyMs: 42 } },
};

// WR-01: simulates a response whose headers/status arrived fine but whose
// body read is aborted mid-stream — response.json() rejects with a genuine
// AbortError (a DOMException), not a SyntaxError. A minimal object stands in
// for Response here (rather than a real ReadableStream) because it pins down
// exactly the failure mode under test: json() rejecting with an AbortError,
// independent of how any particular stream implementation surfaces one.
function abortingJsonResponse(status: number, requestId: string): Response {
  const abortError = new DOMException("aborted", "AbortError");
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "x-request-id": requestId }),
    json: () => Promise.reject(abortError),
  } as unknown as Response;
}

describe("fetchHealth", () => {
  it("returns data and the request id on a 200 response", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify(HEALTH_BODY), {
        status: 200,
        headers: { "x-request-id": "3f0c8a6e-2b1d-4c9e-9a7f-5d4e3c2b1a09" },
      })) as typeof fetch;

    const result = await fetchHealth({ fetchImpl });

    expect(result.requestId).toBe("3f0c8a6e-2b1d-4c9e-9a7f-5d4e3c2b1a09");
    expect(result.data).toEqual(HEALTH_BODY);
  });

  it("throws ApiError with status and request id on a non-2xx response", async () => {
    const fetchImpl = (async () =>
      new Response("Service Unavailable", {
        status: 503,
        headers: { "x-request-id": "3f0c8a6e-2b1d-4c9e-9a7f-5d4e3c2b1a09" },
      })) as typeof fetch;

    await expect(fetchHealth({ fetchImpl })).rejects.toMatchObject({
      status: 503,
      requestId: "3f0c8a6e-2b1d-4c9e-9a7f-5d4e3c2b1a09",
    } satisfies Partial<ApiError>);
  });

  it("rejects with the ApiError code and requestId parsed from a JSON error body", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId: "r-1" },
        }),
        { status: 500 },
      )) as typeof fetch;

    await expect(fetchHealth({ fetchImpl })).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      requestId: "r-1",
    } satisfies Partial<ApiError>);
  });

  it("falls back to HTTP_<status> and the header request id on a non-JSON error body", async () => {
    const fetchImpl = (async () =>
      new Response("Bad Gateway", {
        status: 502,
        headers: { "x-request-id": "r-2" },
      })) as typeof fetch;

    await expect(fetchHealth({ fetchImpl })).rejects.toMatchObject({
      status: 502,
      code: "HTTP_502",
      requestId: "r-2",
    } satisfies Partial<ApiError>);
  });

  it("rejects with ApiError INVALID_RESPONSE_BODY when a 2xx response body is not valid JSON", async () => {
    const fetchImpl = (async () =>
      new Response("not json", {
        status: 200,
        headers: { "x-request-id": "r-3" },
      })) as typeof fetch;

    await expect(fetchHealth({ fetchImpl })).rejects.toBeInstanceOf(ApiError);
    await expect(fetchHealth({ fetchImpl })).rejects.toMatchObject({
      status: 200,
      code: "INVALID_RESPONSE_BODY",
      requestId: "r-3",
    } satisfies Partial<ApiError>);
  });

  it("rethrows an aborted signal's error instead of wrapping it as NETWORK_ERROR", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchImpl = (async () => {
      throw abortError;
    }) as typeof fetch;

    await expect(fetchHealth({ fetchImpl })).rejects.toBe(abortError);
  });

  // WR-01 regression: an AbortError raised while reading a 2xx body (headers
  // already arrived, so this is the shared parseJsonBody stage, not the
  // network-fetch stage above) must surface as an abort, not get relabelled
  // ApiError INVALID_RESPONSE_BODY.
  it("rethrows an AbortError raised mid-body-read instead of wrapping it as INVALID_RESPONSE_BODY", async () => {
    const fetchImpl = (async () => abortingJsonResponse(200, "r-abort")) as typeof fetch;

    const rejection = fetchHealth({ fetchImpl });
    await expect(rejection).rejects.toBeInstanceOf(DOMException);
    await expect(rejection).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("login", () => {
  it('sends credentials: "include" so the session cookie is attached', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_url, init) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({
          email: "a@example.com",
          balances: [{ asset: "USDT", amount: "10000.00000000" }],
        }),
        { status: 200, headers: { "x-request-id": "r-login" } },
      );
    }) as typeof fetch;

    const result = await login({ email: "a@example.com", password: "password1" }, { fetchImpl });

    expect(capturedInit?.credentials).toBe("include");
    expect(result.data.email).toBe("a@example.com");
  });

  it("rejects with ApiError INVALID_CREDENTIALS and the server's message on a 401", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
            requestId: "r-1",
          },
        }),
        { status: 401 },
      )) as typeof fetch;

    await expect(
      login({ email: "a@example.com", password: "wrong" }, { fetchImpl }),
    ).rejects.toMatchObject({
      status: 401,
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password",
      requestId: "r-1",
    } satisfies Partial<ApiError>);
  });

  it("rejects with an ApiError exposing field detail on a 400 validation failure", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "Please fix the highlighted fields",
            requestId: "r-2",
            fields: { email: "Enter a valid email address" },
          },
        }),
        { status: 400 },
      )) as typeof fetch;

    await expect(
      login({ email: "bad", password: "password1" }, { fetchImpl }),
    ).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
      fields: { email: "Enter a valid email address" },
    } satisfies Partial<ApiError>);
  });

  it("leaves fields null when the error body carries no field detail, so existing callers are unaffected", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "Invalid email or password",
            requestId: "r-3",
          },
        }),
        { status: 401 },
      )) as typeof fetch;

    await expect(
      login({ email: "a@example.com", password: "wrong" }, { fetchImpl }),
    ).rejects.toMatchObject({ fields: null } satisfies Partial<ApiError>);
  });
});

describe("logout", () => {
  it('sends credentials: "include" and resolves successfully on a 200', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_url, init) => {
      capturedInit = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    const result = await logout({ fetchImpl });

    expect(capturedInit?.credentials).toBe("include");
    expect(result.data).toEqual({ ok: true });
  });
});

describe("fetchWallet", () => {
  it('sends credentials: "include" and returns balances on a 200', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (_url, init) => {
      capturedInit = init;
      return new Response(
        JSON.stringify({ balances: [{ asset: "USDT", amount: "10000.00000000" }] }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await fetchWallet({ fetchImpl });

    expect(capturedInit?.credentials).toBe("include");
    expect(result.data.balances).toEqual([{ asset: "USDT", amount: "10000.00000000" }]);
  });

  it("rejects with ApiError UNAUTHENTICATED on a 401", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: { code: "UNAUTHENTICATED", message: "Not signed in", requestId: "r-4" },
        }),
        { status: 401 },
      )) as typeof fetch;

    await expect(fetchWallet({ fetchImpl })).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHENTICATED",
    } satisfies Partial<ApiError>);
  });

  // WR-01 regression: fetchWallet shares parseJsonBody with signup/fetchMe/
  // login/logout — proving the fix here proves it for every call site, not
  // just fetchHealth's own (already-covered) network-fetch-stage case.
  it("rethrows an AbortError raised mid-body-read instead of wrapping it as INVALID_RESPONSE_BODY", async () => {
    const fetchImpl = (async () => abortingJsonResponse(200, "r-abort-wallet")) as typeof fetch;

    const rejection = fetchWallet({ fetchImpl });
    await expect(rejection).rejects.toBeInstanceOf(DOMException);
    await expect(rejection).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("fetchMarketChart", () => {
  const CHART_BODY: ChartResponse = {
    id: "bitcoin",
    window: "7d",
    points: [
      { time: 1_700_000_000, value: 100 },
      { time: 1_700_000_060, value: 101 },
    ],
    fetchedAt: "2026-09-16T10:00:00.000Z",
    stale: false,
  };

  it("sends no credentials, encodes the id in the path, and puts the window in the query", async () => {
    let capturedUrl: string | undefined;
    let capturedInit: RequestInit | undefined;
    const fetchImpl = (async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(JSON.stringify(CHART_BODY), {
        status: 200,
        headers: { "x-request-id": "r-chart" },
      });
    }) as typeof fetch;

    const result = await fetchMarketChart("bitcoin", "7d", { fetchImpl });

    expect(capturedUrl).toContain("/api/markets/bitcoin/chart");
    expect(capturedUrl).toContain("window=7d");
    expect(capturedInit?.credentials).toBeUndefined();
    expect(result.data).toEqual(CHART_BODY);
    expect(result.requestId).toBe("r-chart");
  });

  it("URL-encodes a coin id containing characters that need escaping", async () => {
    let capturedUrl: string | undefined;
    const fetchImpl = (async (url) => {
      capturedUrl = String(url);
      return new Response(JSON.stringify(CHART_BODY), { status: 200 });
    }) as typeof fetch;

    await fetchMarketChart("weird/id?", "1d", { fetchImpl });

    expect(capturedUrl).toContain(encodeURIComponent("weird/id?"));
  });

  it("rejects with ApiError UNKNOWN_MARKET and the request id on a 404", async () => {
    const fetchImpl = (async () =>
      new Response(
        JSON.stringify({
          error: { code: "UNKNOWN_MARKET", message: "Unknown market", requestId: "r-404" },
        }),
        { status: 404 },
      )) as typeof fetch;

    await expect(fetchMarketChart("nope", "1d", { fetchImpl })).rejects.toMatchObject({
      status: 404,
      code: "UNKNOWN_MARKET",
      requestId: "r-404",
    } satisfies Partial<ApiError>);
  });

  it("rethrows an aborted signal's error instead of wrapping it as NETWORK_ERROR", async () => {
    const abortError = new DOMException("aborted", "AbortError");
    const fetchImpl = (async () => {
      throw abortError;
    }) as typeof fetch;

    await expect(fetchMarketChart("bitcoin", "1d", { fetchImpl })).rejects.toBe(abortError);
  });

  // WR-04 (carried forward from 02-REVIEW.md WR-01): an AbortError raised
  // while reading a NON-2xx body (parseErrorResponse's stage, not
  // parseJsonBody's) must also surface as an abort, not get relabelled as a
  // synthetic ApiError("HTTP_<status>"). Trade.tsx's chart-fetch effect
  // aborts in-flight requests on every window/coin-id change, so this is the
  // call site that made the gap reachable in practice.
  it("rethrows an AbortError raised mid-body-read of a non-2xx response instead of wrapping it as HTTP_<status>", async () => {
    const fetchImpl = (async () => abortingJsonResponse(404, "r-abort-404")) as typeof fetch;

    const rejection = fetchMarketChart("bitcoin", "1d", { fetchImpl });
    await expect(rejection).rejects.toBeInstanceOf(DOMException);
    await expect(rejection).rejects.toMatchObject({ name: "AbortError" });
  });
});
