// Absolute session-lifetime enforcement.
//
// Supabase refresh tokens do not expire by default, so a persisted session
// can stay valid indefinitely as long as the tab keeps auto-refreshing the
// access token. That is convenient but a security risk: a stolen device or
// a forgotten public-computer session never forces re-authentication.
//
// We cap the *absolute* age of a session (independent of activity) at
// SESSION_MAX_AGE_MS. Once a session is older than that, the user must sign
// in again. The login time is stored client-side because Supabase does not
// expose the original session-creation timestamp after refresh-token
// rotation.

const SESSION_START_KEY = 'iy_session_started_at';

// 7 days — a common "remember me" ceiling for web apps handling personal
// data. Long enough to avoid nagging weekly-active users, short enough that
// an abandoned session cannot live for months.
export const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Record the moment a session began (called right after a successful login). */
export function markSessionStart(now: number = Date.now()): void {
  try {
    localStorage.setItem(SESSION_START_KEY, String(now));
  } catch {
    // localStorage unavailable (private mode / disabled) — enforcement
    // simply falls back to Supabase's own token lifetimes.
  }
}

/** Clear the stored session-start marker (called on logout/expiry). */
export function clearSessionStart(): void {
  try {
    localStorage.removeItem(SESSION_START_KEY);
  } catch {
    // ignore
  }
}

/**
 * Returns the stored session-start timestamp, seeding it to `now` the first
 * time we encounter a session without one (e.g. sessions that predate this
 * feature). This means the cap is measured from first sighting for legacy
 * sessions, and from actual login for new ones.
 */
function getOrSeedSessionStart(now: number): number {
  try {
    const raw = localStorage.getItem(SESSION_START_KEY);
    if (raw) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    localStorage.setItem(SESSION_START_KEY, String(now));
  } catch {
    // ignore
  }
  return now;
}

/**
 * True when the current session has exceeded the absolute maximum age and the
 * user should be forced to log in again.
 */
export function isSessionExpired(now: number = Date.now()): boolean {
  const start = getOrSeedSessionStart(now);
  return now - start > SESSION_MAX_AGE_MS;
}
