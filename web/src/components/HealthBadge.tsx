import { useEffect, useState } from "react";
import { ApiError, fetchHealth, type UpstreamStatus } from "../lib/api.js";

type BadgeState =
  | { kind: "loading" }
  | { kind: "ok"; upstreamStatus: UpstreamStatus }
  | { kind: "error"; requestId: string | null };

export function HealthBadge() {
  const [state, setState] = useState<BadgeState>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    fetchHealth({ signal: controller.signal })
      .then((result) => {
        setState({ kind: "ok", upstreamStatus: result.data.upstream.coingecko.status });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const requestId = error instanceof ApiError ? error.requestId : null;
        setState({ kind: "error", requestId });
      });

    return () => controller.abort();
  }, []);

  let label: string;
  if (state.kind === "loading") {
    label = "Checking API…";
  } else if (state.kind === "ok") {
    label = `API ok · CoinGecko ${state.upstreamStatus}`;
  } else {
    label = state.requestId ? `API unreachable · Request ID ${state.requestId}` : "API unreachable";
  }

  return <span data-testid="health-badge">{label}</span>;
}
