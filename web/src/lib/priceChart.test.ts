import { describe, expect, it, vi } from "vitest";
import type { ChartPoint } from "./api.js";
import { createChartController, toSeriesData, type ChartControllerDeps } from "./priceChart.js";

// No DOM in this workspace (vitest.config.ts's environment is "node") — the
// whole point of priceChart.ts is that its lifecycle is testable without
// one. A hand-written fake chart factory stands in for the real
// lightweight-charts createChart/addSeries surface; the real drawing is
// proven only in scripts/smoke-dev.mjs's browser step (03-04's Task 3).

function makeFakeChart() {
  const series = { setData: vi.fn() };
  const timeScale = { fitContent: vi.fn() };
  const addSeriesCalls: unknown[] = [];
  const chart = {
    addSeries: vi.fn((definition: unknown, options: unknown) => {
      addSeriesCalls.push({ definition, options });
      return series;
    }),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => timeScale),
    remove: vi.fn(),
  };
  return { chart, series, timeScale, addSeriesCalls };
}

function makeFakeResizeTarget() {
  const added: Array<() => void> = [];
  const removed: Array<() => void> = [];
  return {
    addEventListener: vi.fn((_type: "resize", listener: () => void) => {
      added.push(listener);
    }),
    removeEventListener: vi.fn((_type: "resize", listener: () => void) => {
      removed.push(listener);
    }),
    added,
    removed,
  };
}

function makeContainer(clientWidth = 800): HTMLElement {
  return { clientWidth } as unknown as HTMLElement;
}

function makeDeps(
  overrides: Partial<{
    chartFactory: ReturnType<typeof vi.fn>;
    resizeTarget: ReturnType<typeof makeFakeResizeTarget>;
  }> = {},
) {
  const fake = makeFakeChart();
  const resize = overrides.resizeTarget ?? makeFakeResizeTarget();
  const chartFactory = overrides.chartFactory ?? vi.fn(() => fake.chart);
  const deps: ChartControllerDeps = {
    chartFactory: chartFactory as unknown as ChartControllerDeps["chartFactory"],
    resizeTarget: resize,
    seriesDefinition:
      "fake-area-series-definition" as unknown as ChartControllerDeps["seriesDefinition"],
  };
  return { fake, resize, chartFactory, deps };
}

const POINTS: ChartPoint[] = [
  { time: 1_700_000_000, value: 100.5 },
  { time: 1_700_000_060, value: 101.25 },
];

describe("toSeriesData", () => {
  it("maps chart points to the library's time-and-value shape without altering the numbers", () => {
    expect(toSeriesData(POINTS)).toEqual([
      { time: 1_700_000_000, value: 100.5 },
      { time: 1_700_000_060, value: 101.25 },
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(toSeriesData([])).toEqual([]);
  });
});

describe("createChartController", () => {
  it("calls the injected chart factory exactly once, with the container and a width taken from it", () => {
    const container = makeContainer(640);
    const { chartFactory, fake } = makeDeps();

    createChartController(container, {
      chartFactory: chartFactory as unknown as ChartControllerDeps["chartFactory"],
    });

    expect(chartFactory).toHaveBeenCalledTimes(1);
    const [passedContainer, passedOptions] = (chartFactory as ReturnType<typeof vi.fn>).mock
      .calls[0] as [HTMLElement, { width: number }];
    expect(passedContainer).toBe(container);
    expect(passedOptions.width).toBe(640);
    expect(fake.chart.addSeries).toHaveBeenCalledTimes(1);
  });

  it("calling setData three times creates no additional chart and calls the series' own data setter three times", () => {
    const container = makeContainer();
    const { deps, fake, chartFactory } = makeDeps();
    const controller = createChartController(container, deps);

    controller.setData(POINTS);
    controller.setData([]);
    controller.setData(POINTS);

    expect(chartFactory).toHaveBeenCalledTimes(1);
    expect(fake.series.setData).toHaveBeenCalledTimes(3);
  });

  it("setData fits the visible time scale to the content on every call", () => {
    const container = makeContainer();
    const { deps, fake } = makeDeps();
    const controller = createChartController(container, deps);

    controller.setData(POINTS);
    controller.setData(POINTS);

    expect(fake.timeScale.fitContent).toHaveBeenCalledTimes(2);
  });

  it("registers exactly one resize listener on the injected target and removes exactly that listener on destroy", () => {
    const container = makeContainer();
    const { deps, resize } = makeDeps();
    const controller = createChartController(container, deps);

    expect(resize.addEventListener).toHaveBeenCalledTimes(1);
    expect(resize.addEventListener.mock.calls[0]?.[0]).toBe("resize");

    controller.destroy();

    expect(resize.removeEventListener).toHaveBeenCalledTimes(1);
    expect(resize.removed[0]).toBe(resize.added[0]);
  });

  it("a resize event applies a new width taken from the container rather than recreating anything", () => {
    const container = makeContainer(800);
    const { deps, fake, chartFactory, resize } = makeDeps();
    createChartController(container, deps);

    // Mutate the container's own width, then invoke the exact listener the
    // controller registered — simulating a real resize event.
    (container as unknown as { clientWidth: number }).clientWidth = 1024;
    resize.added[0]?.();

    expect(chartFactory).toHaveBeenCalledTimes(1);
    expect(fake.chart.applyOptions).toHaveBeenCalledWith({ width: 1024 });
  });

  it("destroy calls the chart object's own removal method exactly once, and a second destroy is a no-op", () => {
    const container = makeContainer();
    const { deps, fake } = makeDeps();
    const controller = createChartController(container, deps);

    controller.destroy();
    controller.destroy();

    expect(fake.chart.remove).toHaveBeenCalledTimes(1);
  });

  it("after destroy, a further setData is ignored rather than throwing against a removed chart", () => {
    const container = makeContainer();
    const { deps, fake } = makeDeps();
    const controller = createChartController(container, deps);

    controller.destroy();

    expect(() => controller.setData(POINTS)).not.toThrow();
    expect(fake.series.setData).not.toHaveBeenCalled();
  });
});
