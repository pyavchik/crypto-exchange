import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter, Navigate, matchRoutes } from "react-router";
import { AppRoutes, appRoutes } from "./App.js";
import { AuthProvider, type AuthState } from "./lib/auth.js";

// /orders moved out of this shared loop in 02-03: it is now a
// ProtectedRoute-guarded page (D-28), so rendering it without an
// authenticated provider no longer shows the ComingSoon page — see the
// dedicated guarded-route tests below, which cover /orders together with
// /wallet.
const COMING_SOON_ROUTE_CASES = [
  { path: "/markets", title: "Markets" },
  { path: "/trade", title: "Trade" },
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

  it("renders the guard's loading shell (not the page) at /wallet and /orders with no AuthProvider — default context state is loading", () => {
    for (const path of ["/wallet", "/orders"]) {
      const markup = renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>
          <AppRoutes />
        </MemoryRouter>,
      );

      expect(markup).toContain('data-testid="protected-route-loading"');
      expect(markup).not.toContain("<h1>Wallet</h1>");
      expect(markup).not.toContain("<h1>Orders</h1>");
      expect(markup).toContain('href="/markets"');
      expect(markup).toContain('href="/trade"');
      expect(markup).toContain('href="/wallet"');
      expect(markup).toContain('href="/orders"');
      expect(markup).toContain("Powered by CoinGecko");
    }
  });

  it("redirects /wallet and /orders when anonymous — neither the loading shell nor the page renders", () => {
    for (const path of ["/wallet", "/orders"]) {
      const markup = renderToStaticMarkup(
        <MemoryRouter initialEntries={[path]}>
          <AuthProvider initialState={{ kind: "anonymous" }}>
            <AppRoutes />
          </AuthProvider>
        </MemoryRouter>,
      );

      expect(markup).not.toContain('data-testid="protected-route-loading"');
      expect(markup).not.toContain("<h1>Wallet</h1>");
      expect(markup).not.toContain("<h1>Orders</h1>");
      // The shell itself still renders around the (null) redirect.
      expect(markup).toContain('href="/markets"');
      expect(markup).toContain("Powered by CoinGecko");
    }
  });

  it("renders /wallet and /orders when authenticated", () => {
    const AUTHENTICATED_STATE: AuthState = {
      kind: "authenticated",
      email: "a@example.com",
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    };

    const walletMarkup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/wallet"]}>
        <AuthProvider initialState={AUTHENTICATED_STATE}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(walletMarkup).toContain("<h1>Wallet</h1>");
    expect(walletMarkup).toContain("10000.00000000");

    const ordersMarkup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/orders"]}>
        <AuthProvider initialState={AUTHENTICATED_STATE}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(ordersMarkup).toContain("<h1>Orders</h1>");
    expect(ordersMarkup).toContain("Coming soon");
  });

  it("renders the signed-in email and a Log out control in the nav when authenticated", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/markets"]}>
        <AuthProvider
          initialState={{ kind: "authenticated", email: "a@example.com", balances: [] }}
        >
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(markup).toContain("a@example.com");
    expect(markup).toContain("Log out");
    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain('href="/signup"');
  });

  it("renders Log in and Sign up links in the nav when anonymous", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/markets"]}>
        <AuthProvider initialState={{ kind: "anonymous" }}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/signup"');
    expect(markup).not.toContain("Log out");
  });

  it("renders neither the auth links nor the Log out control in the nav while loading", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/markets"]}>
        <AppRoutes />
      </MemoryRouter>,
    );

    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain('href="/signup"');
    expect(markup).not.toContain("Log out");
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
