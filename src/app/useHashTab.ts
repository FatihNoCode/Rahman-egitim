import { useState, useEffect } from 'react';

/**
 * Syncs a dashboard tab with the URL hash (e.g. #tab=teachers) so reloading
 * keeps the same tab open. Switching tabs replaces the current history entry
 * rather than pushing a new one — otherwise every tab click stacks up, and a
 * single back gesture (or Android's hardware back button, which has no other
 * gate) unwinds through every tab visited that session, landing far earlier
 * than expected instead of leaving the dashboard.
 */
export function useHashTab<T extends string>(
  defaultTab: T,
  validTabs: readonly T[],
): [T, (tab: T) => void] {
  const readHash = (): T => {
    const match = window.location.hash.match(/tab=([^&]+)/);
    const value = match ? (decodeURIComponent(match[1]) as T) : defaultTab;
    return validTabs.includes(value) ? value : defaultTab;
  };

  const [tab, setTabState] = useState<T>(readHash);

  useEffect(() => {
    const onPop = () => setTabState(readHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTab = (next: T) => {
    setTabState(next);
    const hash = `#tab=${next}`;
    if (window.location.hash !== hash) {
      window.history.replaceState(null, '', hash);
    }
  };

  return [tab, setTab];
}
