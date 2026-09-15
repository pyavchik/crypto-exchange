import { useCallback, useEffect, useRef, useState } from "react";
import { fetchHealth, type UpstreamStatus } from "../lib/api.js";
import {
  createHealthPoller,
  type HealthState,
  type VisibilityAdapter,
} from "../lib/healthPoller.js";

function upstreamLabel(status: UpstreamStatus): string {
  return status === "not_configured" ? "not configured" : status;
}

export interface HealthBadgeViewProps {
  state: HealthState;
  checking: boolean;
  onRecheck: () => void;
}

// Pure view: renders only React text children (never raw HTML) so API-supplied
// strings (version, commit, error messages) can never inject markup (T-01-22).
export function HealthBadgeView({ state, checking, onRecheck }: HealthBadgeViewProps) {
  let body: React.ReactNode;

  if (state.kind === "loading") {
    body = <span>Checking API…</span>;
  } else if (state.kind === "ok") {
    const upstream = state.data.upstream.coingecko;
    const title = `version ${state.data.version}, commit ${state.data.commit}, checked ${
      upstream.checkedAt ?? "never"
    }`;
    body = (
      <span title={title}>
        API ok{" "}
        <span data-status={upstream.status}>CoinGecko: {upstreamLabel(upstream.status)}</span>
      </span>
    );
  } else {
    body = (
      <span>
        API unreachable
        {state.error.requestId ? <span> Request ID: {state.error.requestId}</span> : null}
      </span>
    );
  }

  return (
    <div className="health-badge" data-testid="health-badge">
      {body}
      <button
        type="button"
        aria-label="Re-check API health"
        disabled={checking}
        onClick={onRecheck}
      >
        Re-check
      </button>
    </div>
  );
}

function createDocumentVisibilityAdapter(): VisibilityAdapter {
  return {
    isVisible: () => document.visibilityState === "visible",
    subscribe: (listener) => {
      document.addEventListener("visibilitychange", listener);
      return () => document.removeEventListener("visibilitychange", listener);
    },
  };
}

export function HealthBadge() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });
  const [checking, setChecking] = useState(false);
  const pollerRef = useRef<ReturnType<typeof createHealthPoller> | null>(null);

  useEffect(() => {
    const poller = createHealthPoller({
      fetchHealth,
      onUpdate: (next) => {
        setState(next);
        setChecking(poller.isChecking());
      },
      visibility: createDocumentVisibilityAdapter(),
    });
    pollerRef.current = poller;
    poller.start();
    setChecking(poller.isChecking());

    return () => {
      poller.stop();
      pollerRef.current = null;
    };
  }, []);

  const handleRecheck = useCallback(() => {
    const poller = pollerRef.current;
    if (!poller) return;
    void poller.refresh();
    setChecking(poller.isChecking());
  }, []);

  return <HealthBadgeView state={state} checking={checking} onRecheck={handleRecheck} />;
}
