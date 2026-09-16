import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { AppRoutes } from "../App.js";
import { ApiError, type SessionResponse } from "./api.js";
import {
  AuthProvider,
  nextAuthState,
  performLogin,
  performLogout,
  type AuthClient,
} from "./auth.js";
import { SignupView } from "../pages/Signup.js";
import { WalletView } from "../pages/Wallet.js";

describe("nextAuthState", () => {
  it("maps a successful /api/me result to authenticated with email and balances", () => {
    const data: SessionResponse = {
      email: "a@example.com",
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    };
    const state = nextAuthState({
      status: "fulfilled",
      value: { data, requestId: "r-1" },
    });
    expect(state).toEqual({
      kind: "authenticated",
      email: "a@example.com",
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    });
  });

  it("maps an ApiError with status 401 to anonymous", () => {
    const state = nextAuthState({
      status: "rejected",
      reason: new ApiError(401, "UNAUTHENTICATED", "r-2"),
    });
    expect(state).toEqual({ kind: "anonymous" });
  });

  it("maps a network error to anonymous (fail closed)", () => {
    const state = nextAuthState({
      status: "rejected",
      reason: new ApiError(null, "NETWORK_ERROR", null),
    });
    expect(state).toEqual({ kind: "anonymous" });
  });

  it("maps any other failure (a non-ApiError) to anonymous (fail closed)", () => {
    const state = nextAuthState({ status: "rejected", reason: new TypeError("boom") });
    expect(state).toEqual({ kind: "anonymous" });
  });
});

describe("performLogin", () => {
  it("resolves to the authenticated state on success", async () => {
    const client: Pick<AuthClient, "login"> = {
      login: async () => ({
        data: { email: "a@example.com", balances: [{ asset: "USDT", amount: "10000.00000000" }] },
        requestId: "r-1",
      }),
    };

    const state = await performLogin(client, "a@example.com", "password1");

    expect(state).toEqual({
      kind: "authenticated",
      email: "a@example.com",
      balances: [{ asset: "USDT", amount: "10000.00000000" }],
    });
  });

  it("rejects with the ApiError untouched on failure", async () => {
    const error = new ApiError(401, "INVALID_CREDENTIALS", "r-2");
    const client: Pick<AuthClient, "login"> = {
      login: async () => {
        throw error;
      },
    };

    await expect(performLogin(client, "a@example.com", "wrong")).rejects.toBe(error);
  });
});

describe("performLogout", () => {
  it("resolves when the underlying request succeeds", async () => {
    const client: Pick<AuthClient, "logout"> = {
      logout: async () => ({ data: { ok: true }, requestId: null }),
    };

    await expect(performLogout(client)).resolves.toBeUndefined();
  });

  it("resolves even when the underlying request rejects — the user asked to be signed out", async () => {
    const client: Pick<AuthClient, "logout"> = {
      logout: async () => {
        throw new ApiError(null, "NETWORK_ERROR", null);
      },
    };

    await expect(performLogout(client)).resolves.toBeUndefined();
  });
});

describe("SignupView", () => {
  it("renders an email field, a password field and a submit control in its default state", () => {
    const markup = renderToStaticMarkup(
      <SignupView
        email=""
        password=""
        formError={null}
        requestId={null}
        submitting={false}
        onEmailChange={() => {}}
        onPasswordChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(markup).toContain('type="email"');
    expect(markup).toContain('type="password"');
    expect(markup).toContain('type="submit"');
  });

  it("renders a form-level error message when present", () => {
    const markup = renderToStaticMarkup(
      <SignupView
        email="a@example.com"
        password="password1"
        formError="That email is already registered"
        requestId="r-3"
        submitting={false}
        onEmailChange={() => {}}
        onPasswordChange={() => {}}
        onSubmit={() => {}}
      />,
    );
    expect(markup).toContain("That email is already registered");
    expect(markup).toContain("Request ID: r-3");
  });
});

describe("WalletView", () => {
  it("renders the granted USDT balance and asset symbol", () => {
    const markup = renderToStaticMarkup(
      <WalletView balances={[{ asset: "USDT", amount: "10000.00000000" }]} />,
    );
    expect(markup).toContain("10000.00000000");
    expect(markup).toContain("USDT");
  });
});

describe("App shell nav auth state", () => {
  it("renders the signed-in email in the nav when authenticated", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/markets"]}>
        <AuthProvider
          initialState={{
            kind: "authenticated",
            email: "signed-in@example.com",
            balances: [{ asset: "USDT", amount: "10000.00000000" }],
          }}
        >
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(markup).toContain("signed-in@example.com");
    expect(markup).not.toContain('href="/login"');
    expect(markup).not.toContain('href="/signup"');
  });

  it("renders links to /login and /signup when anonymous", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/markets"]}>
        <AuthProvider initialState={{ kind: "anonymous" }}>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(markup).toContain('href="/login"');
    expect(markup).toContain('href="/signup"');
  });
});
