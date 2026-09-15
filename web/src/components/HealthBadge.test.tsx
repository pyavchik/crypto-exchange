import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError, type HealthResponse, type UpstreamStatus } from "../lib/api.js";
import type { HealthState } from "../lib/healthPoller.js";
import { HealthBadgeView } from "./HealthBadge.js";

function okState(status: UpstreamStatus): HealthState {
  const data: HealthResponse = {
    status: "ok",
    version: "0.1.0",
    commit: "abc1234",
    upstream: { coingecko: { status, checkedAt: "2026-09-15T00:00:00.000Z", latencyMs: 12 } },
  };
  return { kind: "ok", data, requestId: "r-ok" };
}

describe("HealthBadgeView", () => {
  it("shows the loading label", () => {
    const markup = renderToStaticMarkup(
      <HealthBadgeView state={{ kind: "loading" }} checking={false} onRecheck={() => {}} />,
    );
    expect(markup).toContain("Checking API");
  });

  it("shows API ok and CoinGecko: not configured with data-status not_configured", () => {
    const markup = renderToStaticMarkup(
      <HealthBadgeView state={okState("not_configured")} checking={false} onRecheck={() => {}} />,
    );
    expect(markup).toContain("API ok");
    expect(markup).toContain("CoinGecko: not configured");
    expect(markup).toContain('data-status="not_configured"');
  });

  it.each(["ok", "degraded", "down"] as const)("renders its own data-status value for %s", (status) => {
    const markup = renderToStaticMarkup(
      <HealthBadgeView state={okState(status)} checking={false} onRecheck={() => {}} />,
    );
    expect(markup).toContain(`data-status="${status}"`);
  });

  it("shows API unreachable and the request id when the error carries one", () => {
    const error = new ApiError(500, "INTERNAL_ERROR", "r-9");
    const markup = renderToStaticMarkup(
      <HealthBadgeView state={{ kind: "error", error }} checking={false} onRecheck={() => {}} />,
    );
    expect(markup).toContain("API unreachable");
    expect(markup).toContain("Request ID: r-9");
  });

  it("shows no Request ID text when the error carries none", () => {
    const error = new ApiError(null, "NETWORK_ERROR", null);
    const markup = renderToStaticMarkup(
      <HealthBadgeView state={{ kind: "error", error }} checking={false} onRecheck={() => {}} />,
    );
    expect(markup).toContain("API unreachable");
    expect(markup).not.toContain("Request ID");
  });

  it("renders a type=button Re-check button, disabled only while checking", () => {
    const idle = renderToStaticMarkup(
      <HealthBadgeView state={{ kind: "loading" }} checking={false} onRecheck={() => {}} />,
    );
    expect(idle).toContain('type="button"');
    expect(idle).not.toContain("disabled");

    const checking = renderToStaticMarkup(
      <HealthBadgeView state={{ kind: "loading" }} checking={true} onRecheck={() => {}} />,
    );
    expect(checking).toContain("disabled");
  });
});
