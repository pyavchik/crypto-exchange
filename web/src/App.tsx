import {
  BrowserRouter,
  NavLink,
  Navigate,
  Outlet,
  useRoutes,
  type RouteObject,
} from "react-router";
import { HealthBadge } from "./components/HealthBadge.js";
import { AuthProvider, useAuth } from "./lib/auth.js";
import { ComingSoon } from "./pages/ComingSoon.js";
import { Signup } from "./pages/Signup.js";
import { Wallet } from "./pages/Wallet.js";

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link active" : "nav-link";
}

function AuthNav() {
  const { state } = useAuth();

  if (state.kind === "authenticated") {
    // D-30: signed-in email on every page; 02-03 adds the logout control here.
    return (
      <span className="nav-account" data-testid="nav-account">
        {state.email}
      </span>
    );
  }

  return (
    <>
      <NavLink to="/login" className={navLinkClassName}>
        Log in
      </NavLink>
      <NavLink to="/signup" className={navLinkClassName}>
        Sign up
      </NavLink>
    </>
  );
}

export function AppLayout() {
  return (
    <div className="app-shell">
      <header>
        <nav className="app-nav">
          <NavLink to="/markets" className="brand">
            CoinGecko Paper Exchange
          </NavLink>
          <NavLink to="/markets" className={navLinkClassName}>
            Markets
          </NavLink>
          <NavLink to="/trade" className={navLinkClassName}>
            Trade
          </NavLink>
          <NavLink to="/wallet" className={navLinkClassName}>
            Wallet
          </NavLink>
          <NavLink to="/orders" className={navLinkClassName}>
            Orders
          </NavLink>
          <AuthNav />
        </nav>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
      <footer className="app-footer">
        <HealthBadge />
        <a href="https://www.coingecko.com" target="_blank" rel="noopener noreferrer">
          Powered by CoinGecko
        </a>
      </footer>
    </div>
  );
}

// D-01: dark shell now, four placeholder routes; later phases fill each
// ComingSoon page in without restyling the shell.
export const appRoutes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/markets" replace /> },
      {
        path: "markets",
        element: (
          <ComingSoon title="Markets" description="Coming soon: live markets table (Phase 3)" />
        ),
      },
      {
        path: "trade",
        element: (
          <ComingSoon
            title="Trade"
            description="Coming soon: price chart and order panel (Phases 3-5)"
          />
        ),
      },
      { path: "wallet", element: <Wallet /> },
      { path: "signup", element: <Signup /> },
      {
        path: "orders",
        element: (
          <ComingSoon title="Orders" description="Coming soon: open orders and history (Phase 5)" />
        ),
      },
      {
        path: "*",
        element: <ComingSoon title="Page not found" description="This page does not exist." />,
      },
    ],
  },
];

export function AppRoutes() {
  return useRoutes(appRoutes);
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
