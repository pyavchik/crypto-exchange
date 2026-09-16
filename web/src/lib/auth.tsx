import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  fetchMe as realFetchMe,
  signup as realSignup,
  type ApiResult,
  type Balance,
  type SessionResponse,
} from "./api.js";

// D-29: modeled on healthPoller.ts's HealthState convention — a discriminated
// union driven by a plain fetch wrapper, no external state library. Nothing
// is ever written to localStorage or any other client store; the httpOnly
// cookie is the only session store, and it is unreadable from JavaScript.
export type AuthState =
  | { kind: "loading" }
  | { kind: "authenticated"; email: string; balances: Balance[] }
  | { kind: "anonymous" };

// Pure reducer: the unit-testable seam, shaped like the standard
// PromiseSettledResult so it drops straight into a fetchMe().then/.catch or
// Promise.allSettled call site. Any ApiError (401 or otherwise) and any
// non-ApiError failure (network error, programming error) both map to
// anonymous — the app fails closed and never renders protected content on an
// ambiguous error.
export function nextAuthState(result: PromiseSettledResult<ApiResult<SessionResponse>>): AuthState {
  if (result.status === "rejected") return { kind: "anonymous" };
  return {
    kind: "authenticated",
    email: result.value.data.email,
    balances: result.value.data.balances,
  };
}

export interface AuthClient {
  signup: typeof realSignup;
  fetchMe: typeof realFetchMe;
}

const defaultClient: AuthClient = { signup: realSignup, fetchMe: realFetchMe };

export interface AuthContextValue {
  state: AuthState;
  signup(email: string, password: string): Promise<void>;
}

function unusedAction(): never {
  throw new Error("useAuth() was called outside an AuthProvider");
}

const AuthContext = createContext<AuthContextValue>({
  state: { kind: "loading" },
  signup: unusedAction,
});

export interface AuthProviderProps {
  children: ReactNode;
  client?: AuthClient;
  initialState?: AuthState;
}

export function AuthProvider({
  children,
  client = defaultClient,
  initialState,
}: AuthProviderProps) {
  const [state, setState] = useState<AuthState>(initialState ?? { kind: "loading" });

  useEffect(() => {
    // Test seam: when initialState is provided (Signup/Wallet view tests),
    // never overwrite it by racing a real fetchMe call.
    if (initialState !== undefined) return;
    let cancelled = false;
    client.fetchMe().then(
      (value) => {
        if (!cancelled) setState(nextAuthState({ status: "fulfilled", value }));
      },
      (reason: unknown) => {
        if (!cancelled) setState(nextAuthState({ status: "rejected", reason }));
      },
    );
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount only — client/initialState are test
    // seams (constant for the component's lifetime in real usage), not
    // reactive dependencies.
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      async signup(email: string, password: string): Promise<void> {
        // Rethrows ApiError untouched so the form can render the failure
        // (D-27's per-field wiring is 02-03's task; this task only needs the
        // form-level error path).
        const result = await client.signup({ email, password });
        setState({
          kind: "authenticated",
          email: result.data.email,
          balances: result.data.balances,
        });
      },
    }),
    [state, client],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
