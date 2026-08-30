import { useEffect, useRef } from 'react';

/**
 * "Open the thing this notification is about."
 *
 * A bell entry carries a link — `#billing:<childId>`, `#agenda-event:2026-09-05`,
 * `#report-absence:<childId>` — and tapping it has to land the reader on that
 * exact thing. It used to do `window.location.hash = link`, which quietly did
 * nothing at all: the dashboards read their tab from `#tab=<id>` (see
 * useHashTab) and only listen for `popstate`, while assigning to `hash` fires
 * `hashchange`. Every notification in the app was a dead link.
 *
 * The dashboard is also the only thing that knows what these links *mean*:
 * which child to switch to first, which of them open a dialog rather than a
 * tab, which are finished by being read. So the bell does not navigate — it
 * publishes, and the dashboard that is mounted decides.
 *
 * A link published before any dashboard has subscribed is held (a push
 * notification handled during cold start arrives well before the parent
 * dashboard mounts) and delivered to the first subscriber.
 */

type Handler = (link: string) => void;

const subscribers = new Set<{ fn: Handler }>();
let pending: string | null = null;

export function openDeepLink(link: string) {
  if (!link) return;
  if (subscribers.size === 0) {
    pending = link;
    return;
  }
  subscribers.forEach((s) => s.fn(link));
}

/**
 * Handle deep links while this component is mounted.
 *
 * The handler is held through a ref, so a dashboard can pass an inline arrow
 * function that closes over its current state without re-subscribing (and
 * re-delivering the pending link) on every render.
 */
export function useDeepLink(handler: Handler) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    const entry = { fn: (link: string) => ref.current(link) };
    subscribers.add(entry);
    if (pending) {
      const link = pending;
      pending = null;
      // After paint: the dashboard that just mounted is usually still loading
      // the data the link points into.
      setTimeout(() => entry.fn(link), 0);
    }
    return () => {
      subscribers.delete(entry);
    };
  }, []);
}
