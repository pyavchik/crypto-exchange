import { describe, expect, it } from "vitest";
import {
  formatCompact,
  formatPercent,
  formatPrice,
  formatUpdatedAt,
  toPairLabel,
} from "./format.js";

describe("formatPrice", () => {
  it("renders a five-figure price with exactly two decimals and a thousands separator", () => {
    expect(formatPrice(75755)).toBe("$75,755.00");
  });

  it("renders a value of 0.00001234 with enough significant digits that it does not collapse to a string of zeros", () => {
    const result = formatPrice(0.00001234);
    expect(result).not.toMatch(/^\$0\.00$/);
    expect(result).toMatch(/1234/);
  });

  it("renders a value between one cent and one dollar with four decimals", () => {
    expect(formatPrice(0.1234)).toBe("$0.1234");
  });

  it("renders null as a dash rather than throwing", () => {
    expect(() => formatPrice(null)).not.toThrow();
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("returns a leading plus for a positive value with direction up", () => {
    expect(formatPercent(1.5)).toEqual({ text: "+1.50%", direction: "up" });
  });

  it("returns a leading minus for a negative value with direction down", () => {
    expect(formatPercent(-2.34)).toEqual({ text: "-2.34%", direction: "down" });
  });

  it("returns a dash with direction flat for null", () => {
    expect(formatPercent(null)).toEqual({ text: "—", direction: "flat" });
  });

  it("treats exactly zero as flat", () => {
    expect(formatPercent(0)).toEqual({ text: "+0.00%", direction: "flat" });
  });
});

describe("formatCompact", () => {
  it("renders 1_200_000_000 as a one-decimal billions string", () => {
    expect(formatCompact(1_200_000_000)).toBe("1.2B");
  });

  it("renders 3_400_000 as millions", () => {
    expect(formatCompact(3_400_000)).toBe("3.4M");
  });

  it("renders 999 unabbreviated", () => {
    expect(formatCompact(999)).toBe("999");
  });

  it("renders null as a dash", () => {
    expect(formatCompact(null)).toBe("—");
  });
});

describe("formatUpdatedAt", () => {
  it("renders a timestamp two seconds before now as a seconds-ago phrase", () => {
    const now = 1_700_000_000_000;
    const twoSecondsAgo = new Date(now - 2_000).toISOString();
    expect(formatUpdatedAt(twoSecondsAgo, now)).toBe("2 seconds ago");
  });

  it("renders a timestamp four minutes before now as a minutes-ago phrase", () => {
    const now = 1_700_000_000_000;
    const fourMinutesAgo = new Date(now - 4 * 60_000).toISOString();
    expect(formatUpdatedAt(fourMinutesAgo, now)).toBe("4 minutes ago");
  });

  it("renders null as a dash", () => {
    expect(formatUpdatedAt(null, 1_700_000_000_000)).toBe("—");
  });
});

describe("toPairLabel", () => {
  it("returns the uppercased symbol joined to the quote symbol by a slash", () => {
    expect(toPairLabel("btc")).toBe("BTC/USDT");
  });
});
