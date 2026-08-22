/**
 * Keeps an in-progress lesson registration on the teacher's own device.
 *
 * Registering a lesson is attendance, a behaviour smiley per child with its
 * explanation, a lesson summary and optionally a homework assignment — and
 * until it is all filled in, none of it is sent. Everything lived in React
 * state until the one "opslaan" at the end, which meant a closed tab, a dead
 * battery, a phone that reclaimed the browser while the teacher looked
 * something up, or a lost connection threw away the whole lesson with no
 * warning and nothing to go back to. Teachers do this at the end of a lesson,
 * standing up, on a phone. It is the worst possible moment to lose ten
 * minutes of work.
 *
 * So the form writes itself to localStorage as it is filled in, and reads it
 * back when the same class and date are opened again. This is a safety net,
 * not sync: the draft never leaves the device, and it is deleted the moment
 * the lesson is actually saved to the server.
 */

const KEY_PREFIX = 'rahman.lessonDraft.';

/**
 * How long a draft survives. Long enough to cover a battery dying mid-lesson
 * and being picked up that evening, short enough that a draft abandoned weeks
 * ago never resurfaces and gets mistaken for this week's lesson.
 */
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface LessonDraft {
  attendanceRecords: Record<string, boolean | 'late'>;
  behaviorRecords: Record<string, 'sad' | 'neutral' | 'happy'>;
  behaviorNeedsInfo: Record<string, boolean>;
  behaviorNotes: Record<string, string>;
  lessonSummary: string;
  addHomework: boolean;
  homeworkType: 'class' | 'individual';
  selectedStudents: string[];
  homeworkCategory: 'custom' | 'quran' | 'temel';
  homeworkDueDate: string;
  customHomeworkTr: string;
  customHomeworkNl: string;
  selectedSurah: number;
  isWholeSurah: boolean;
  ayatFrom: number;
  ayatTo: number;
  temelPageFrom: string;
  temelPageTo: string;
}

interface StoredDraft {
  savedAt: number;
  draft: LessonDraft;
}

// Class and date both key the draft: a teacher with two classes on one day
// must not have the first one's attendance appear under the second, and
// yesterday's lesson must not appear under today's.
function keyFor(classId: string, date: string) {
  return `${KEY_PREFIX}${classId}.${date}`;
}

/**
 * True when the draft holds anything a teacher would mind losing. An
 * untouched form is not worth storing — and, more importantly, not worth
 * offering to restore later.
 */
export function draftHasContent(draft: LessonDraft): boolean {
  return (
    Object.keys(draft.attendanceRecords).length > 0 ||
    Object.keys(draft.behaviorRecords).length > 0 ||
    draft.lessonSummary.trim() !== '' ||
    draft.addHomework
  );
}

export function saveLessonDraft(classId: string, date: string, draft: LessonDraft): void {
  if (!classId || !date) return;
  try {
    if (!draftHasContent(draft)) {
      localStorage.removeItem(keyFor(classId, date));
      return;
    }
    const stored: StoredDraft = { savedAt: Date.now(), draft };
    localStorage.setItem(keyFor(classId, date), JSON.stringify(stored));
  } catch {
    // Private mode, or storage full. The draft is a safety net; the form
    // itself keeps working exactly as it did before.
  }
}

export function loadLessonDraft(classId: string, date: string): LessonDraft | null {
  if (!classId || !date) return null;
  try {
    const raw = localStorage.getItem(keyFor(classId, date));
    if (!raw) return null;
    const stored = JSON.parse(raw) as StoredDraft;
    if (!stored || typeof stored.savedAt !== 'number' || !stored.draft) return null;
    if (Date.now() - stored.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(classId, date));
      return null;
    }
    return stored.draft;
  } catch {
    return null;
  }
}

export function clearLessonDraft(classId: string, date: string): void {
  try {
    localStorage.removeItem(keyFor(classId, date));
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
}

/**
 * Deletes drafts past their expiry. Called on mount so a device that has been
 * used for a year does not accumulate a key per class per lesson day for ever.
 */
export function pruneLessonDrafts(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX)) continue;
      try {
        const stored = JSON.parse(localStorage.getItem(key) || 'null') as StoredDraft | null;
        if (!stored || typeof stored.savedAt !== 'number' || Date.now() - stored.savedAt > MAX_AGE_MS) {
          stale.push(key);
        }
      } catch {
        stale.push(key);
      }
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — nothing to prune */
  }
}
