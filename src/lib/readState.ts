// Per-device "I have read this" marks, for things the server has no read
// column for.
//
// Lesson reports (lesverslagen) are written by the teacher for the class, not
// addressed to one parent, so there is nothing on the record to flip when a
// parent reads one. Rather than teach the server a per-parent read table for a
// mark that only affects how the list is sorted, the mark lives on the device
// that did the reading. The cost of losing it — a phone reset, a second phone
// — is that an already-read report reappears in the unread list, which is
// exactly what would happen if the parent had opened it on that device for the
// first time anyway.
//
// Nothing here throws: private mode and a full quota both degrade to "nothing
// is marked read", which is the safe direction.

const PREFIX = 'ilimyolu:read:';

function key(scope: string, ownerId: string) {
  return `${PREFIX}${scope}:${ownerId}`;
}

export function getReadIds(scope: string, ownerId: string): Set<string> {
  if (!ownerId) return new Set();
  try {
    const raw = localStorage.getItem(key(scope, ownerId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}

export function setRead(scope: string, ownerId: string, id: string, read = true): Set<string> {
  const ids = getReadIds(scope, ownerId);
  if (read) ids.add(id);
  else ids.delete(id);
  try {
    // Capped so a family that has been with the school for years cannot grow
    // an unbounded key: the newest marks are the ones that still matter.
    const list = Array.from(ids).slice(-500);
    localStorage.setItem(key(scope, ownerId), JSON.stringify(list));
  } catch {
    /* private mode / quota — the mark just won't outlive this session */
  }
  return ids;
}
