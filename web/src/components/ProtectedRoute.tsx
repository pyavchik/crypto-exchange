import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { useAuth } from "../lib/auth.js";

export interface ProtectedRouteProps {
  children: ReactNode;
}

// D-28/D-29: gates access to pages that hold private data. Renders exactly
// one of three things:
//   - a loading shell while the bootstrap GET /api/me call is still in
//     flight — without this branch every protected page would flash the
//     login screen for the duration of that call (D-29);
//   - a declarative redirect to /login when anonymous — react-router's
//     <Navigate> primitive, the same one App.tsx already uses for its index
//     redirect, rather than an effect-driven navigate() call, so the
//     protected content never renders for a frame before the redirect runs;
//   - its children when authenticated.
//
// T-02-19: this is a user-experience control, not the security boundary —
// every private read is authorised server-side by the session preHandler
// regardless of what this component renders.
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { state } = useAuth();

  if (state.kind === "loading") {
    return (
      <section data-testid="protected-route-loading">
        <p>Loading…</p>
      </section>
    );
  }

  if (state.kind === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
