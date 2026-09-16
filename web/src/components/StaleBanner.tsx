import { formatUpdatedAt } from "../lib/format.js";

export interface StaleBannerProps {
  stale: boolean;
  fetchedAt: string | null;
  now?: () => number;
}

// D-42: staleness is a property of the payload, not a separate endpoint, so
// this banner is driven purely by the stale flag and the timestamp that
// already travelled on it — no state, no poller of its own, modelled on the
// view half of HealthBadge.tsx. Every string rendered here is either a
// literal in this file or a value from the shared formatter (T-01-22): no
// markup is ever rendered from a string.
export function StaleBanner({ stale, fetchedAt, now = Date.now }: StaleBannerProps) {
  if (!stale) return null;

  // Handle an absent timestamp by rendering the warning without an age
  // phrase rather than throwing.
  const agePhrase =
    fetchedAt !== null ? ` — data last updated ${formatUpdatedAt(fetchedAt, now())}.` : "";

  return (
    <div className="stale-banner" data-testid="stale-banner" role="status">
      <strong>Prices delayed</strong>
      {agePhrase}
    </div>
  );
}
