import { useEffect, useState } from 'react';
import {
  BellRing,
  CalendarDays,
  FolderOpen,
  Home,
  MessageSquare,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react';

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

// Destinations every role gets on top of its dashboard sections. Prefixed ids
// so they can never collide with a dashboard's own tab names — the admin
// dashboard, for instance, already owns a tab called `settings`.
//
// Account is still a destination, but it is no longer *on the bar*: it's
// reached from the avatar button in the top-right corner, where an account
// lives in every other app. That also frees a slot on a bar that was tight.
export const MOBILE_ACCOUNT_ID = 'mobile-account';
export const MOBILE_PREFS_ID = 'mobile-prefs';

export function mobileExtraNavItems(language: 'nl' | 'tr'): MobileNavItem[] {
  return [
    { id: MOBILE_PREFS_ID, label: language === 'tr' ? 'Tercihler' : 'Voorkeuren', icon: SlidersHorizontal },
  ];
}

// Destinations that exist for more than one role, named once.
//
// A parent, a teacher and a beheerder are often the same person wearing three
// hats — the mother who teaches on Saturday and sits on the board. When the
// landing tab was "Start" in one role and "Vandaag" in the next, switching
// roles meant re-learning a bar that was doing the same job. What each tab
// *shows* still differs per role (a parent's home is their children, a
// teacher's is today's lessons); only the name and the icon are shared, so the
// bar stays recognisable across the roles one person holds.
//
// Roles keep owning their role-specific tabs (Elif-Ba, Boekhouding, Importeren)
// — this table is only for the ones that overlap.
const SHARED_NAV: Record<string, { nl: string; tr: string; shortNl?: string; shortTr?: string; icon: LucideIcon }> = {
  home: { nl: 'Start', tr: 'Ana Sayfa', icon: Home },
  meldingen: {
    nl: 'Ziekmeldingen',
    tr: 'Hastalık Bildirimleri',
    shortNl: 'Meldingen',
    shortTr: 'Bildirim',
    icon: BellRing,
  },
  oudergesprekken: {
    nl: 'Oudergesprekken',
    tr: 'Veli Görüşmeleri',
    shortNl: 'Gesprekken',
    shortTr: 'Görüşme',
    icon: MessageSquare,
  },
  agenda: { nl: 'Agenda', tr: 'Ajanda', icon: CalendarDays },
  cases: { nl: 'Cases', tr: 'Vakalar', icon: FolderOpen },
};

// Build a nav item for a shared destination. `id` is the role's own tab id,
// which is free to differ from the shared `key` — a teacher's landing tab is
// `signals` and a parent's is `overview`, but both are Start.
export function sharedNavItem(key: keyof typeof SHARED_NAV | string, language: 'nl' | 'tr', id?: string): MobileNavItem {
  const entry = SHARED_NAV[key];
  const tr = language === 'tr';
  return {
    id: id ?? key,
    label: tr ? entry.tr : entry.nl,
    shortLabel: (tr ? entry.shortTr : entry.shortNl) ?? undefined,
    icon: entry.icon,
  };
}

// How many destinations sit directly on the bar. When a role has more than
// (VISIBLE_SLOTS + 1) destinations the last visible slot becomes a "More"
// button and the overflow moves into its sheet. With exactly one extra we can
// show it directly instead of hiding a single item behind More.
export const VISIBLE_SLOTS = 4;

const KEY = (role: string) => `ilimyolu:navorder:${role}`;

// The home destination is always the first slot on the bar and cannot be moved
// — not by the user, and not by an order saved before this rule existed. It's
// the one tab people reach for without looking, so it has to be in the same
// place every time.
export function homeNavId(defaultIds: string[]) {
  return defaultIds[0];
}

// Merge a stored order with the currently-available ids: keep the stored
// sequence (minus ids that no longer exist), then append any new ids that
// weren't saved yet (e.g. a tab that became available this session). The home
// id is forced back to the front regardless of what was stored.
function reconcile(stored: string[], available: string[]): string[] {
  const home = homeNavId(available);
  const kept = stored.filter((id) => available.includes(id) && id !== home);
  const missing = available.filter((id) => !kept.includes(id) && id !== home);
  return [home, ...kept, ...missing].filter(Boolean);
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
    // Re-run reconcile rather than trusting the caller: it re-pins home, so a
    // reorder UI can never persist an order that demotes it.
    const safe = reconcile(next, defaultIds);
    setOrderState(safe);
    save(role, safe);
  };

  return [order, setOrder];
}
