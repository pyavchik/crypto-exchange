import { useEffect, useRef, useState } from "react";
import type { ChartPoint } from "../lib/api.js";
import {
  createChartController,
  type ChartController,
  type ChartControllerDeps,
} from "../lib/priceChart.js";

export interface PriceChartProps {
  points: ChartPoint[];
  // Test/future-phase seam — forwarded straight to createChartController so
  // a future test or a future phase can substitute the chart factory,
  // series definition, resize target or layout options without touching
  // this file.
  chartDeps?: ChartControllerDeps;
}

// D-37: two separate effects, deliberately. The first depends only on the
// container and creates the controller once, returning a cleanup that
// destroys it through the library's own chart.remove() call — the only
// correct teardown (priceChart.ts). It must never depend on the data. The
// second effect depends on the points and calls the existing controller's
// data setter, then flips the readiness flag. If the data were in the first
// effect's dependency list, every 30-second poll tick would tear the chart
// down and rebuild it — both a leak risk and a visible flash every half
// minute. `renderToStaticMarkup` cannot execute either effect (no DOM in
// this workspace's vitest.config.ts), so this file's own coverage stops at
// the markup this function returns before any effect runs — the mount,
// update and teardown behavior is covered by priceChart.test.ts, and the
// real drawing is covered by scripts/smoke-dev.mjs's browser step.
export function PriceChart({ points, chartDeps }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<ChartController | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const controller = createChartController(containerRef.current, chartDeps);
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
    // Intentionally mount-only: chartDeps is a test/future-phase seam,
    // constant for the component's lifetime in real usage, not a reactive
    // dependency — see the doc comment above for why data must stay out of
    // this effect's dependency list too.
  }, []);

  useEffect(() => {
    if (!controllerRef.current) return;
    controllerRef.current.setData(points);
    setReady(true);
  }, [points]);

  return (
    <div>
      <div ref={containerRef} data-testid="price-chart" />
      {ready ? <span data-testid="chart-ready" /> : null}
    </div>
  );
}
