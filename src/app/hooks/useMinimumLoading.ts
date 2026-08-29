import { useEffect, useRef, useState } from 'react';

/**
 * Keeps a loading flag "on" long enough for the branded waw spinner
 * (src/app/components/ui/Spinner.tsx) to write itself at least once.
 *
 * Without this, a fetch that resolves in 150ms flips `loading` back to false
 * before the spinner has drawn a single stroke — the screen flashes an empty
 * panel and the reader is left wondering whether anything happened. Pass the
 * raw loading flag in, render the returned value instead: while the real load
 * is running it passes straight through, and once the load finishes it stays
 * true until `minMs` has elapsed since the load began.
 *
 * A load that genuinely takes longer than `minMs` is not delayed at all.
 */
export function useMinimumLoading(active: boolean, minMs = 1100): boolean {
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

    const remaining = minMs - (Date.now() - startedAt.current);
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
