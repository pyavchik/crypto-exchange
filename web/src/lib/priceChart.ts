// D-37: the whole imperative `lightweight-charts` lifecycle, deliberately
// kept outside React so it is unit-testable without a DOM (this workspace's
// vitest.config.ts sets environment: "node" — no jsdom, no canvas). Every
// behavior a naive useEffect gets wrong lives here, once: exactly one chart
// per controller, a data setter that never recreates the chart, exactly one
// resize listener added and removed, and idempotent teardown through the
// library's own chart.remove() call.
import {
  AreaSeries,
  ColorType,
  createChart as createRealChart,
  type ChartOptions,
  type DeepPartial,
  type IChartApi,
  type ISeriesApi,
  type SeriesDefinition,
  type SeriesPartialOptionsMap,
  type UTCTimestamp,
} from "lightweight-charts";
import type { ChartPoint } from "./api.js";

const CHART_HEIGHT = 300;

// Dark-shell colours matching this project's existing dark theme closely
// enough to avoid a jarring white rectangle dropped into the trade page.
const DARK_LAYOUT_OPTIONS: DeepPartial<ChartOptions> = {
  layout: {
    background: { type: ColorType.Solid, color: "#0f1115" },
    textColor: "#d1d4dc",
  },
  grid: {
    vertLines: { color: "#1c1f26" },
    horzLines: { color: "#1c1f26" },
  },
  // The library's own Apache-2.0 NOTICE requires a link to tradingview.com
  // on any page using it. The default attributionLogo option (true) renders
  // a small TradingView logo/link in the chart's corner and satisfies that
  // requirement automatically — this must never be set to false here without
  // adding an equivalent link elsewhere on the trade page (03-RESEARCH.md
  // Pattern 6/7).
};

const AREA_SERIES_OPTIONS: SeriesPartialOptionsMap["Area"] = {
  lineColor: "#4ade80",
  topColor: "rgba(74, 222, 128, 0.4)",
  bottomColor: "rgba(74, 222, 128, 0.0)",
};

/**
 * Maps the API's chart points to lightweight-charts' { time, value } shape
 * without altering the numbers. The API (api/src/lib/marketData.ts's
 * toChartPoints) already converts CoinGecko's millisecond timestamps to
 * whole seconds — this function must NOT divide again. Dividing twice, or
 * not dividing at all, both silently place every sample tens of thousands of
 * years away from now and render a chart with no visible data rather than an
 * obviously broken one; this comment is the one place that fact is recorded.
 * Returns an empty array for an empty input.
 */
export function toSeriesData(points: ChartPoint[]): { time: UTCTimestamp; value: number }[] {
  return points.map((point) => ({ time: point.time as UTCTimestamp, value: point.value }));
}

export interface ChartFactoryFn {
  (container: HTMLElement, options: DeepPartial<ChartOptions>): IChartApi;
}

// Method-shorthand syntax (not arrow-typed properties) so this interface is
// checked bivariantly against the real `window` object's broader
// addEventListener/removeEventListener overloads.
export interface ResizeTargetLike {
  addEventListener(type: "resize", listener: () => void): void;
  removeEventListener(type: "resize", listener: () => void): void;
}

export interface ChartControllerDeps {
  chartFactory?: ChartFactoryFn;
  seriesDefinition?: SeriesDefinition<"Area">;
  resizeTarget?: ResizeTargetLike;
  layoutOptions?: DeepPartial<ChartOptions>;
}

export interface ChartController {
  setData(points: ChartPoint[]): void;
  destroy(): void;
}

/**
 * Calls the injected chart factory exactly once, with the supplied container
 * and a width taken from that container's own clientWidth. Registers exactly
 * one resize handler on the injected resize target, which applies a freshly
 * read width to the chart rather than recreating anything. `destroy()` is
 * the only correct teardown: it removes the resize listener and calls the
 * chart object's own remove() method, guarded by a destroyed flag so a
 * double teardown (React's development mode deliberately double-invokes
 * effects) or a late data update is a no-op rather than a throw against a
 * removed chart.
 */
export function createChartController(
  container: HTMLElement,
  deps: ChartControllerDeps = {},
): ChartController {
  const {
    chartFactory = createRealChart,
    seriesDefinition = AreaSeries,
    // Pass the real window object itself, never an object literal wrapping
    // its methods — a browser applies a receiver check (WebIDL "this" check)
    // to host object methods and throws "Illegal invocation" when one is
    // called as a property of some other object. This is the exact bug class
    // already caught once in this project's poller (D-40,
    // wiki/pages/findings/health-poller-illegal-invocation.md).
    resizeTarget = typeof window !== "undefined" ? window : undefined,
    layoutOptions = DARK_LAYOUT_OPTIONS,
  } = deps;

  let destroyed = false;

  const chart = chartFactory(container, {
    ...layoutOptions,
    width: container.clientWidth,
    height: CHART_HEIGHT,
  });

  const series: ISeriesApi<"Area"> = chart.addSeries(seriesDefinition, AREA_SERIES_OPTIONS);

  function handleResize(): void {
    chart.applyOptions({ width: container.clientWidth });
  }

  resizeTarget?.addEventListener("resize", handleResize);

  return {
    setData(points: ChartPoint[]): void {
      if (destroyed) return;
      series.setData(toSeriesData(points));
      chart.timeScale().fitContent();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      resizeTarget?.removeEventListener("resize", handleResize);
      chart.remove();
    },
  };
}
