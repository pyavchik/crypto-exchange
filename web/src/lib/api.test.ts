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
});
