import { describe, expect, it } from "vitest";
import { ApiError, fetchHealth, type HealthResponse } from "./api.js";

const HEALTH_BODY: HealthResponse = {
  status: "ok",
  version: "0.1.0",
  commit: "dev",
  upstream: { coingecko: { status: "ok", checkedAt: "2026-09-15T00:00:00.000Z", latencyMs: 42 } },
};

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
});
