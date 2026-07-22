// Whether the product tour has already been shown this session.
//
// Split out from ProductTour.tsx so the *check* costs nothing: App asks this on
// every login to decide whether to render the tour at all, and it should not
// have to pull down the tour's chunk (and the third-party embed inside it) just
// to find out the answer is usually "yes, already seen".
//
// Persisted in sessionStorage (not localStorage) so the tour shows again for
// every parent on each new login session, rather than being suppressed forever
// on a device. Dismissing it only hides it for the rest of the current session;
// a mid-session refresh won't re-pop it, but the next login will.

export type TourRole = 'parent' | 'teacher' | 'admin';

const storageKey = (role: TourRole) => `ilimyolu_tour_seen_${role}`;

export function hasSeenTour(role: string): boolean {
  if (role !== 'parent' && role !== 'teacher' && role !== 'admin') return true;
  try {
    return sessionStorage.getItem(storageKey(role)) === '1';
  } catch {
    return true;
  }
}

export function markTourSeen(role: TourRole) {
  try {
    sessionStorage.setItem(storageKey(role), '1');
  } catch {
    // ignore storage failures — worst case the tour shows again
  }
}
