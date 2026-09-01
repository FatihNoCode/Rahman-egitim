import { useEffect, useRef, useState } from 'react';

/**
 * How long a panel keeps rendering its loading placeholder.
 *
 * Two failure modes sit on either side of this. Drop the placeholder the
 * instant a 150ms fetch resolves and the panel flashes. Hold every load for a
 * fixed second and the app stops feeling responsive — a panel whose data was
 * already in hand still makes you wait, which is the more expensive mistake
 * of the two, because it is paid on every screen.
 *
 * The answer is split over two places. Here: the placeholder is up for as
 * long as the load runs, and afterwards only long enough that a spinner which
 * did get drawn is not yanked away mid-stroke. In LoadingState: the waw
 * itself does not appear until `SPINNER_DELAY_MS` have passed, so a load that
 * beats the grace period never draws one at all — the content simply appears,
 * which is what "instant" looks like.
 *
 * A load that genuinely takes longer than the grace period is not delayed.
 */
export const SPINNER_DELAY_MS = 220;

export function useMinimumLoading(active: boolean, minMs = 600): boolean {
  const [held, setHeld] = useState(active);
  const startedAt = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    if (active) {
      if (startedAt.current === null) startedAt.current = Date.now();
      setHeld(true);
      return;
    }

    if (startedAt.current === null) {
      setHeld(false);
      return;
    }

    const elapsed = Date.now() - startedAt.current;
    // Nothing was drawn yet, so there is nothing to hold on screen.
    const until = elapsed < SPINNER_DELAY_MS ? 0 : SPINNER_DELAY_MS + minMs;
    const remaining = until - elapsed;
    if (remaining <= 0) {
      startedAt.current = null;
      setHeld(false);
      return;
    }

    const timer = setTimeout(() => {
      startedAt.current = null;
      setHeld(false);
    }, remaining);
    return () => clearTimeout(timer);
  }, [active, minMs]);

  return active || held;
}
