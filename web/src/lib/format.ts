// D-47: the single centralized module for money/percent/compact-number and
// pair-label display formatting, so Phases 4-5 reuse one implementation
// instead of scattering ad-hoc `toFixed` calls. Display formatting only —
// this module performs no arithmetic on a value that will later be a balance
// or a quantity; decimal-safe money math arrives with WAL-03 in Phase 4.

// The display-only quote leg — mirrors api/src/lib/marketData.ts's
// QUOTE_SYMBOL. The underlying reference price CoinGecko quotes is USD; the
// stablecoin leg is this project's own stated 1:1 convention (D-36).
export const QUOTE_SYMBOL = "USDT";

const DASH = "—";

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const STANDARD_PRICE_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const CENTS_PRICE_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

/**
 * Renders a decimal number of enough significant digits that a genuinely
 * priced sub-cent micro-cap stays legible instead of collapsing to a string
 * of zeros under a fixed two-decimal precision.
 */
function formatSubCentPrice(value: number): string {
  const magnitude = Math.abs(value);
  const exponent = Math.floor(Math.log10(magnitude));
  // Enough decimal places to show 4 significant digits beyond the leading
  // zeros (e.g. 0.00001234 needs 8 decimal places to show "1234").
  const decimals = Math.max(2, -exponent + 3);
  const sign = value < 0 ? "-" : "";
  return `${sign}$${magnitude.toFixed(decimals)}`;
}

/**
 * Magnitude-aware, not fixed-precision: at or above one dollar, grouped
 * thousands with two decimals; between one cent and one dollar, four
 * decimals; below one cent, enough significant figures to stay legible.
 * Null, undefined and non-finite inputs all render as an em dash.
 */
export function formatPrice(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return DASH;
  const magnitude = Math.abs(value);
  if (magnitude === 0) return STANDARD_PRICE_FORMAT.format(0);
  if (magnitude >= 1) return STANDARD_PRICE_FORMAT.format(value);
  if (magnitude >= 0.01) return CENTS_PRICE_FORMAT.format(value);
  return formatSubCentPrice(value);
}

export interface FormatPercentResult {
  text: string;
  direction: "up" | "down" | "flat";
}

/**
 * Returns both the display string (signed, two decimals, a percent sign)
 * and a direction discriminator so the view picks a colour class without
 * re-deriving the sign. Exactly zero is treated as flat. Null renders as a
 * dash with direction flat.
 */
export function formatPercent(value: number | null | undefined): FormatPercentResult {
  if (!isFiniteNumber(value)) return { text: DASH, direction: "flat" };
  if (value === 0) return { text: "+0.00%", direction: "flat" };
  const direction: FormatPercentResult["direction"] = value > 0 ? "up" : "down";
  const sign = value > 0 ? "+" : "-";
  return { text: `${sign}${Math.abs(value).toFixed(2)}%`, direction };
}

/**
 * Abbreviates with one decimal at thousands, millions, billions and
 * trillions, and leaves smaller values alone. Null renders as a dash.
 */
export function formatCompact(value: number | null | undefined): string {
  if (!isFiniteNumber(value)) return DASH;
  const magnitude = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (magnitude >= 1e12) return `${sign}${(magnitude / 1e12).toFixed(1)}T`;
  if (magnitude >= 1e9) return `${sign}${(magnitude / 1e9).toFixed(1)}B`;
  if (magnitude >= 1e6) return `${sign}${(magnitude / 1e6).toFixed(1)}M`;
  if (magnitude >= 1e3) return `${sign}${(magnitude / 1e3).toFixed(1)}K`;
  return `${sign}${magnitude}`;
}

/**
 * Turns the payload's own timestamp into a relative phrase, as of `now`.
 * Takes the timestamp as an argument rather than reading a module-level
 * clock (D-40: the "last updated" line reflects the data's age, not the time
 * of the local request), and because a pure function of two arguments is the
 * only shape testable here. Null, or a timestamp that fails to parse, both
 * render as a dash.
 */
export function formatUpdatedAt(iso: string | null | undefined, now: number = Date.now()): string {
  if (iso === null || iso === undefined) return DASH;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return DASH;

  const diffMs = now - timestamp;
  if (diffMs < 1000) return "just now";

  const diffSeconds = Math.floor(diffMs / 1000);
  if (diffSeconds < 60) {
    return diffSeconds === 1 ? "1 second ago" : `${diffSeconds} seconds ago`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
}

/**
 * The single place the display pair convention lives on the browser side.
 * The underlying reference price is the dollar figure CoinGecko quotes; the
 * stablecoin leg is this project's stated 1:1 convention (D-36).
 */
export function toPairLabel(symbol: string): string {
  return `${symbol.toUpperCase()}/${QUOTE_SYMBOL}`;
}
