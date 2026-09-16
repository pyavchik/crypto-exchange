import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Navigate, matchRoutes } from "react-router";
import { AppRoutes, appRoutes } from "./App.js";

const COMING_SOON_ROUTE_CASES = [
  { path: "/markets", title: "Markets" },
  { path: "/trade", title: "Trade" },
  { path: "/orders", title: "Orders" },
] as const;

describe("AppRoutes", () => {
  it.each(COMING_SOON_ROUTE_CASES)(
    "renders the shell and the $title page at $path",
    ({ path, title }) => {
      const markup = renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      );

      expect(markup).toContain(`<h1>${title}</h1>`);
      expect(markup).toContain("Coming soon");
      expect(markup).toContain('href="/markets"');
      expect(markup).toContain('href="/trade"');
      expect(markup).toContain('href="/wallet"');
      expect(markup).toContain('href="/orders"');
      expect(markup).toContain("Powered by CoinGecko");
      expect(markup).toContain('rel="noopener noreferrer"');
    },
  );

  it("renders the shell and the Wallet page at /wallet (no AuthProvider — loading state)", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/wallet"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(markup).toContain("<h1>Wallet</h1>");
    expect(markup).toContain('href="/markets"');
    expect(markup).toContain('href="/trade"');
    expect(markup).toContain('href="/wallet"');
    expect(markup).toContain('href="/orders"');
    expect(markup).toContain("Powered by CoinGecko");
  });

  it("renders the not-found page inside the shell for an unknown path", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/nope"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(markup).toContain("Page not found");
    expect(markup).toContain('href="/markets"');
  });

  it("redirects / to /markets via a Navigate index route", () => {
    const matches = matchRoutes(appRoutes, "/");
    if (!matches) {
      throw new Error("expected appRoutes to match /");
    }
    const leaf = matches[matches.length - 1];

    expect(leaf.route.index).toBe(true);
    const element = leaf.route.element as React.ReactElement<{ to: string; replace?: boolean }>;
    expect(element.type).toBe(Navigate);
    expect(element.props.to).toBe("/markets");
    expect(element.props.replace).toBe(true);
  });
});
