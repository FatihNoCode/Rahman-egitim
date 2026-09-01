// Boot-time data prefetch.
//
// Cold start used to be a strict waterfall: greet the user, check the session,
// mount the dashboard, and only *then* start asking the server what to show —
// so the greeting covered a session check that finishes in a few hundred
// milliseconds while the actual dashboard load, the slow part, still happened
// afterwards behind the waw spinner.
//
// This starts the dashboard's own requests at the same moment as the dashboard
// chunk, before the session check answers, using the token supabase-js already
// has in storage. By the time the greeting has finished typing, the answers are
// usually sitting here and the dashboard can render straight from them with no
// spinner at all.
//
// Everything here is a head start, never a dependency: a prefetch that fails,
// goes stale, or was never started simply isn't found, and the caller falls
// through to the normal request path. That is why nothing in here rejects and
// why the role is read from the last session rather than the current one — a
// wrong guess costs one wasted request and nothing else.

import { getSupabaseClient } from './supabase';

type Settled = { ok: true; data: unknown } | { ok: false };

interface Entry {
  promise: Promise<Settled>;
  // Mirrored synchronously so a component can ask "is this already here?"
  // during render, which is what lets a screen skip its loading state
  // entirely instead of flashing one for a frame.
  settled: Settled | null;
  at: number;
}

const cache = new Map<string, Entry>();

// Long enough to cover a slow cold start, short enough that a prefetch can
// never satisfy a request made after the user has been sitting in the app.
const MAX_AGE_MS = 30_000;

// What each role asks for the moment it lands. Deliberately only the requests
// that a dashboard fires unconditionally on mount for the account's own scope
// — anything school-scoped (X-School-Id) is left alone, since at this point we
// do not yet know which school a superadmin is acting as.
const BOOT_ENDPOINTS: Record<string, string[]> = {
  parent: ['/students', '/classes/all', '/homework/completion', '/oudergesprekken'],
  teacher: ['/classes', '/students'],
};

export const PARENT_BOOT_ENDPOINTS = BOOT_ENDPOINTS.parent;

export function primeBootData(apiBase: string, role: string | null | undefined) {
  const endpoints = role ? BOOT_ENDPOINTS[role] : undefined;
  if (!endpoints) return;

  // One session read shared by all of them. It resolves from local storage in
  // practice, so this does not put a network hop in front of the fetches.
  const tokenPromise = getSupabaseClient()
    .auth.getSession()
    .then(({ data }) => data.session?.access_token || null)
    .catch(() => null);

  for (const endpoint of endpoints) {
    if (cache.has(endpoint)) continue;
    const entry: Entry = { promise: Promise.resolve({ ok: false }), settled: null, at: Date.now() };
    entry.promise = tokenPromise
      .then(async (token): Promise<Settled> => {
        if (!token) return { ok: false };
        try {
          const res = await fetch(`${apiBase}${endpoint}`, {
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          });
          if (!res.ok) return { ok: false };
          return { ok: true, data: await res.json() };
        } catch {
          return { ok: false };
        }
      })
      .then((s) => {
        entry.settled = s;
        return s;
      });
    cache.set(endpoint, entry);
  }
}

function live(endpoint: string): Entry | undefined {
  const entry = cache.get(endpoint);
  if (!entry) return undefined;
  if (Date.now() - entry.at > MAX_AGE_MS) {
    cache.delete(endpoint);
    return undefined;
  }
  return entry;
}

/**
 * Consume a prefetched response, if one is in flight or already back.
 * Resolves to `undefined` when there is nothing usable, which is the caller's
 * signal to make the request itself. Single-use: a later call for the same
 * endpoint is a genuine refresh and must hit the network.
 */
export async function takeBootData(endpoint: string): Promise<unknown | undefined> {
  const entry = live(endpoint);
  if (!entry) return undefined;
  cache.delete(endpoint);
  const settled = await entry.promise;
  return settled.ok ? settled.data : undefined;
}

/**
 * The synchronous, all-or-nothing form: returns the payloads only if every
 * endpoint has *already* come back successfully. A screen calls this during
 * its first render to seed itself, so it never renders a spinner for data it
 * is holding. Returns null if even one is still in flight — the screen then
 * loads normally, and the in-flight ones are still picked up by takeBootData.
 */
export function takeBootBundle(endpoints: string[]): unknown[] | null {
  const entries = endpoints.map(live);
  if (entries.some((e) => !e || e.settled?.ok !== true)) return null;
  for (const endpoint of endpoints) cache.delete(endpoint);
  return entries.map((e) => (e!.settled as { ok: true; data: unknown }).data);
}

/** On sign-out and on a role switch: what was prefetched belongs to the old session. */
export function clearBootData() {
  cache.clear();
}
