import {
  BrowserRouter,
  NavLink,
  Navigate,
  Outlet,
  useNavigate,
  useRoutes,
  type RouteObject,
} from "react-router";
import { HealthBadge } from "./components/HealthBadge.js";
import { ProtectedRoute } from "./components/ProtectedRoute.js";
import { AuthProvider, useAuth } from "./lib/auth.js";
import { ComingSoon } from "./pages/ComingSoon.js";
import { Login } from "./pages/Login.js";
import { Markets } from "./pages/Markets.js";
import { Signup } from "./pages/Signup.js";
import { Trade, TradeIndex } from "./pages/Trade.js";
import { Wallet } from "./pages/Wallet.js";

function navLinkClassName({ isActive }: { isActive: boolean }): string {
  return isActive ? "nav-link active" : "nav-link";
}

function AuthNav() {
  const { state, logout } = useAuth();
  const navigate = useNavigate();

  // D-30: render neither set of controls while the bootstrap request is in
  // flight, so the nav does not flicker between the anonymous and
  // authenticated states.
  if (state.kind === "loading") {
    return null;
  }

  if (state.kind === "authenticated") {
    const handleLogout = (): void => {
      // logout() always resolves to the anonymous state, even if the
      // server-side revocation request itself fails (T-02-20) — the local
      // state and the navigation both happen unconditionally.
      void logout().then(() => {
        void navigate("/login");
      });
    };

    // D-30: the signed-in email and a Log out control, on every page — this
    // lives in AppLayout alongside the other NavLinks, which is what makes
    // "from any page" true by construction (every route renders in this shell).
    return (
      <>
        <span className="nav-account" data-testid="nav-account">
          {state.email}
        </span>
        <button type="button" className="nav-logout" onClick={handleLogout}>
          Log out
        </button>
      </>
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

// D-01: dark shell; Markets (03-01), Wallet (02) and Trade (03-04) now
// replace their original ComingSoon placeholders. Orders (Phase 5) is the
// only page still pending.
export const appRoutes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/markets" replace /> },
      {
        path: "markets",
        element: <Markets />,
      },
      {
        path: "trade",
        element: <TradeIndex />,
      },
      {
        path: "trade/:id",
        element: <Trade />,
      },
      {
        path: "wallet",
        element: (
          <ProtectedRoute>
            <Wallet />
          </ProtectedRoute>
        ),
      },
      { path: "signup", element: <Signup /> },
      { path: "login", element: <Login /> },
      {
        path: "orders",
        element: (
          <ProtectedRoute>
            <ComingSoon
              title="Orders"
              description="Coming soon: open orders and history (Phase 5)"
            />
          </ProtectedRoute>
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
