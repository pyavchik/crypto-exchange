import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router";
import { AuthProvider, type AuthState } from "../lib/auth.js";
import { ProtectedRoute } from "./ProtectedRoute.js";

function renderGuard(initialState: AuthState) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/wallet"]}>
      <AuthProvider initialState={initialState}>
        <ProtectedRoute>
          <p data-testid="protected-content">secret</p>
        </ProtectedRoute>
      </AuthProvider>
    </MemoryRouter>,
  );
}

// react-router's <Navigate> performs its navigation in a useEffect, which
// renderToStaticMarkup never runs (no effects during server rendering) — its
// render output is always null. The anonymous-branch tests below therefore
// prove the redirect indirectly: neither the loading shell nor the children
// render, which is only possible if ProtectedRoute took its third
// (<Navigate>) branch, since the three branches are mutually exclusive and
// exhaustive.
describe("ProtectedRoute", () => {
  it("renders a loading shell and not the children while the auth state is loading", () => {
    const markup = renderGuard({ kind: "loading" });
    expect(markup).toContain('data-testid="protected-route-loading"');
    expect(markup).not.toContain("protected-content");
  });

  it("renders neither the loading shell nor the children when anonymous (the redirect branch)", () => {
    const markup = renderGuard({ kind: "anonymous" });
    expect(markup).not.toContain("protected-route-loading");
    expect(markup).not.toContain("protected-content");
  });

  it("renders its children when authenticated", () => {
    const markup = renderGuard({
      kind: "authenticated",
      email: "a@example.com",
      balances: [],
    });
    expect(markup).toContain("protected-content");
    expect(markup).not.toContain("protected-route-loading");
  });
});
