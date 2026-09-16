import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaleBanner } from "./StaleBanner.js";

const NOW = Date.parse("2026-09-16T10:00:00.000Z");

describe("StaleBanner", () => {
  it("renders nothing at all with a false stale flag", () => {
    const markup = renderToStaticMarkup(
      <StaleBanner stale={false} fetchedAt="2026-09-16T09:59:30.000Z" now={() => NOW} />,
    );
    expect(markup).toBe("");
  });

  it("renders the prices-delayed wording, the banner test id and a phrase naming the age of the data with a true stale flag", () => {
    const markup = renderToStaticMarkup(
      // fetchedAt is 5 minutes before `now`.
      <StaleBanner stale={true} fetchedAt="2026-09-16T09:55:00.000Z" now={() => NOW} />,
    );
    expect(markup).toContain('data-testid="stale-banner"');
    expect(markup).toContain("Prices delayed");
    expect(markup).toContain("5 minutes ago");
  });

  it("still renders the warning without throwing with a true stale flag and a null timestamp", () => {
    expect(() =>
      renderToStaticMarkup(<StaleBanner stale={true} fetchedAt={null} now={() => NOW} />),
    ).not.toThrow();

    const markup = renderToStaticMarkup(
      <StaleBanner stale={true} fetchedAt={null} now={() => NOW} />,
    );
    expect(markup).toContain('data-testid="stale-banner"');
    expect(markup).toContain("Prices delayed");
  });

  it("carries a role appropriate to a status message", () => {
    const markup = renderToStaticMarkup(
      <StaleBanner stale={true} fetchedAt="2026-09-16T09:55:00.000Z" now={() => NOW} />,
    );
    expect(markup).toContain('role="status"');
  });
});
