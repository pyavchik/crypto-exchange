import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PriceChart } from "./PriceChart.js";

// No DOM in this workspace (vitest.config.ts's environment is "node") —
// renderToStaticMarkup never runs an effect, so it can only prove the markup
// this component returns before any effect fires: the chart container
// carrying its test id, and no readiness sentinel (which only appears once
// the data effect has run). The mount/update/teardown lifecycle itself is
// covered by priceChart.test.ts's fake-chart-factory suite, and real
// drawing is covered only by scripts/smoke-dev.mjs's browser step.
describe("PriceChart", () => {
  it("renders the chart container carrying its test id and no readiness sentinel", () => {
    const markup = renderToStaticMarkup(<PriceChart points={[]} />);

    expect(markup).toContain('data-testid="price-chart"');
    expect(markup).not.toContain('data-testid="chart-ready"');
  });
});
