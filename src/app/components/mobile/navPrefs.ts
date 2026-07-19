import { useEffect, useState } from 'react';
import { User, SlidersHorizontal, type LucideIcon } from 'lucide-react';

export interface MobileNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  // Optional bar-only label. These labels were written for the desktop
  // sidebar, where length is free; a tab bar slot is ~72pt wide and anything
  // past ~10 characters ellipsises into noise ("Oudergespr…"). Set this to a
  // short form for the bar — the full `label` is still what the "More" sheet
  // and every other surface shows.
  shortLabel?: string;
}

// The two destinations every role gets on top of its dashboard sections.
// Prefixed ids so they can never collide with a dashboard's own tab names —
// the admin dashboard, for instance, already owns a tab called `settings`.
export const MOBILE_ACCOUNT_ID = 'mobile-account';
export const MOBILE_PREFS_ID = 'mobile-prefs';

export function mobileExtraNavItems(language: 'nl' | 'tr'): MobileNavItem[] {
  return [
    { id: MOBILE_ACCOUNT_ID, label: language === 'tr' ? 'Hesap' : 'Account', icon: User },
    { id: MOBILE_PREFS_ID, label: language === 'tr' ? 'Tercihler' : 'Voorkeuren', icon: SlidersHorizontal },
  ];
}

// How many destinations sit directly on the bar. When a role has more than
// (VISIBLE_SLOTS + 1) destinations the last visible slot becomes a "More"
// button and the overflow moves into its sheet. With exactly one extra we can
// show it directly instead of hiding a single item behind More.
export const VISIBLE_SLOTS = 4;

const KEY = (role: string) => `ilimyolu:navorder:${role}`;

// Merge a stored order with the currently-available ids: keep the stored
// sequence (minus ids that no longer exist), then append any new ids that
// weren't saved yet (e.g. a tab that became available this session).
function reconcile(stored: string[], available: string[]): string[] {
  const kept = stored.filter((id) => available.includes(id));
  const missing = available.filter((id) => !kept.includes(id));
  return [...kept, ...missing];
}

function load(role: string, defaultIds: string[]): string[] {
  try {
    const raw = localStorage.getItem(KEY(role));
    if (!raw) return defaultIds;
    const stored = JSON.parse(raw);
    if (!Array.isArray(stored)) return defaultIds;
    return reconcile(stored as string[], defaultIds);
  } catch {
    return defaultIds;
  }
}

function save(role: string, order: string[]) {
  try {
    localStorage.setItem(KEY(role), JSON.stringify(order));
  } catch {
    /* ignore */
  }
}

const sameOrder = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

// Persisted, user-customisable order of a role's bottom-nav destinations.
// `defaultIds` is the canonical full set; the hook reconciles the saved order
// against it every render so toggled-on/off tabs stay consistent.
export function useNavOrder(
  role: string,
  defaultIds: string[],
): [string[], (order: string[]) => void] {
  const [order, setOrderState] = useState<string[]>(() => load(role, defaultIds));

  const key = defaultIds.join(',');
  useEffect(() => {
    setOrderState((prev) => {
      const next = reconcile(prev, defaultIds);
      return sameOrder(next, prev) ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const setOrder = (next: string[]) => {
    setOrderState(next);
    save(role, next);
  };

  return [order, setOrder];
}
