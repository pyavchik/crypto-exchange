import type { Balance } from "../lib/api.js";
import { useAuth } from "../lib/auth.js";

export interface WalletViewProps {
  balances: Balance[];
}

// Renders amounts exactly as stored (decimal strings), never reformatted
// through a float (WAL-03 decimal-safe rule).
export function WalletView({ balances }: WalletViewProps) {
  return (
    <section>
      <h1>Wallet</h1>
      <table>
        <thead>
          <tr>
            <th>Asset</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {balances.map((balance) => (
            <tr key={balance.asset}>
              <td>{balance.asset}</td>
              <td>{balance.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function Wallet() {
  const { state } = useAuth();

  if (state.kind === "loading") {
    return (
      <section>
        <h1>Wallet</h1>
        <p>Loading…</p>
      </section>
    );
  }

  if (state.kind === "anonymous") {
    // 02-03 replaces this route with a real redirect guard (D-28); this task
    // only needs a safe fallback for an unauthenticated visit.
    return (
      <section>
        <h1>Wallet</h1>
        <p>Please sign in to view your wallet.</p>
      </section>
    );
  }

  return <WalletView balances={state.balances} />;
}
