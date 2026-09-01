import { useEffect, useMemo, useState } from 'react';
import { Archive, ChevronRight } from 'lucide-react';
import { BookOpen, Check, CheckCircle2, FileText, Frown, Meh, Smile } from './EmojiIcons';
import Modal from './ui/modal';
import type { HomeworkItem } from './HomeworkView';

export interface LessonReport {
  /** `<classId>:<date>` — see the /lessons route, which derives it. A phone
   *  can be running against a backend that has not been redeployed yet, so
   *  lessonIdOf below reassembles it from the parts when it is missing. */
  id?: string;
  classId?: string;
  date: string;
  summary: string;
}

export interface BehaviorRecord {
  /** The record's own id. Older backends may not send one — see behaviorIdOf. */
  id?: string;
  date: string;
  rating: number;
  notes?: string;
}

/**
 * Dagsamenvatting — one day, everything the school said about it.
 *
 * The parent's home screen used to carry three separate feeds: lesverslagen,
 * gedrag and huiswerk. They are the same thing seen from three angles — what
 * happened in Saturday's lesson — and splitting them into three headings,
 * three lists and three archives meant a parent had to assemble the day
 * themselves by matching dates across three boxes.
 *
 * So they are one list now, grouped by the day they belong to.
 *
 * A day leaves the list once everything in it is handled — the verslag read,
 * the remark read, the homework ticked or its deadline past — and lands in the
 * archive rather than being deleted.
 */

export interface DaySummaryProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /** Lesson records for the child's class; only those with a summary count. */
  lessons: LessonReport[];
  behaviorList: BehaviorRecord[];
  childId: string;
  childClassId?: string;
  /** `${studentId}:${homeworkId}` -> done. Owned by the dashboard. */
  completion: Record<string, boolean>;
  onToggle: (studentId: string, homeworkId: string) => void;
  /** Named in the dialog when the family has more than one child. */
  childName?: string;
  /** Bump to refetch the homework list. */
  refreshKey?: number;
}

const T = {
  nl: {
    heading: 'Dagsamenvatting',
    intro: 'Lesverslag, gedrag en huiswerk per dag. Wat u afgehandeld heeft, gaat naar het archief.',
    allDone: 'Alles is afgehandeld.',
    lesson: 'Lesverslag',
    behavior: 'Gedrag',
    homework: 'Huiswerk',
    open: 'Openen',
    read: 'Gelezen',
    markRead: 'Markeer als gelezen',
    markDone: 'Markeer als afgerond',
    markOpen: 'Markeer als niet afgerond',
    done: 'Afgerond',
    due: 'Inleveren',
    overdue: 'Inleverdatum verstreken',
    noNote: 'Geen toelichting',
    archive: 'Archief · dagsamenvatting',
    hideArchive: 'Archief dagsamenvatting verbergen',
    close: 'Sluiten',
    ratings: ['', 'Moeilijke les', 'Moeilijke les', 'Neutraal', 'Neutraal', 'Goed'],
  },
  tr: {
    heading: 'Gün özeti',
    intro: 'Her gün için ders özeti, davranış ve ödev. Tamamladıklarınız arşive taşınır.',
    allDone: 'Her şey tamamlandı.',
    lesson: 'Ders özeti',
    behavior: 'Davranış',
    homework: 'Ödev',
    open: 'Aç',
    read: 'Okundu',
    markRead: 'Okundu olarak işaretle',
    markDone: 'Tamamlandı olarak işaretle',
    markOpen: 'Tamamlanmadı olarak işaretle',
    done: 'Tamamlandı',
    due: 'Teslim',
    overdue: 'Teslim tarihi geçti',
    noNote: 'Ek açıklama yok',
    archive: 'Arşiv · gün özeti',
    hideArchive: 'Gün özeti arşivini gizle',
    close: 'Kapat',
    ratings: ['', 'Zor bir ders', 'Zor bir ders', 'Normal', 'Normal', 'İyi'],
  },
};

// Local day, not toISOString(): for anyone in the Netherlands the UTC day is
// still yesterday for the first two hours after midnight.
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const lessonIdOf = (l: LessonReport) => l.id || `${l.classId || ''}:${l.date}`;
const behaviorIdOf = (b: BehaviorRecord) => b.id || `d${b.date}`;

function Face({ rating }: { rating: number }) {
  if (rating <= 2) return <Frown className="h-5 w-5 text-red-500" />;
  if (rating <= 4) return <Meh className="h-5 w-5 text-amber-500" />;
  return <Smile className="h-5 w-5 text-emerald-500" />;
}

type Entry =
  | { kind: 'lesson'; key: string; date: string; summary: string }
  | { kind: 'behavior'; key: string; date: string; rating: number; notes: string }
  | { kind: 'homework'; key: string; date: string; text: string; hwId: string };

export default function DaySummaryPanel({
  language,
  apiRequest,
  lessons,
  behaviorList,
  childId,
  childClassId,
  completion,
  onToggle,
  childName,
  refreshKey = 0,
}: DaySummaryProps) {
  const text = T[language];
  const today = localDay();

  const [readLessons, setReadLessons] = useState<Set<string>>(new Set());
  const [readBehavior, setReadBehavior] = useState<Set<string>>(new Set());
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  // A failed load leaves everything unread, which shows the parent too much
  // rather than too little — the safe direction for what a school wants read.
  useEffect(() => {
    let cancelled = false;
    apiRequest('/lesson-reports/read')
      .then((res) => {
        if (!cancelled) setReadLessons(new Set<string>((res?.read || []).map(String)));
      })
      .catch(() => {});
    apiRequest('/behavior-read')
      .then((res) => {
        if (!cancelled) setReadBehavior(new Set<string>((res?.read || []).map(String)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  useEffect(() => {
    let cancelled = false;
    apiRequest('/homework')
      .then((res) => {
        if (!cancelled) setHomework(res?.homework || []);
      })
      .catch(() => {
        if (!cancelled) setHomework([]);
      });
    return () => {
      cancelled = true;
    };
  }, [apiRequest, refreshKey]);

  // Homework is stored as "Turkish | Dutch" in one field.
  const describe = (hw: HomeworkItem) => {
    const parts = (hw.description || '').split(' | ');
    return (language === 'tr' ? parts[0] : parts[1] || parts[0]) || '';
  };

  // The server hands a parent every piece of homework aimed at any of their
  // children plus every whole-class assignment; whole-class rows carry no
  // student ids, so without the class check a family with children in two
  // classes would see both classes' work under one child's name.
  const myHomework = useMemo(
    () =>
      (homework || []).filter((hw) => {
        if (!hw?.id || !hw.dueDate) return false;
        if (Array.isArray(hw.studentIds)) return hw.studentIds.includes(childId);
        return !!childClassId && hw.classId === childClassId;
      }),
    [homework, childId, childClassId],
  );

  const isHomeworkDone = (hwId: string) => !!completion[`${childId}:${hwId}`];

  const days = useMemo(() => {
    const byDate = new Map<string, Entry[]>();
    const push = (date: string, entry: Entry) => {
      const list = byDate.get(date);
      if (list) list.push(entry);
      else byDate.set(date, [entry]);
    };

    for (const l of lessons || []) {
      if (!l?.date || !l.summary) continue;
      push(l.date, { kind: 'lesson', key: `l:${lessonIdOf(l)}`, date: l.date, summary: l.summary });
    }
    for (const b of behaviorList || []) {
      if (!b?.date || typeof b.rating !== 'number') continue;
      push(b.date, {
        kind: 'behavior',
        key: `b:${behaviorIdOf(b)}`,
        date: b.date,
        rating: b.rating,
        notes: (b.notes || '').trim(),
      });
    }
    for (const hw of myHomework) {
      push(hw.dueDate, {
        kind: 'homework',
        key: `h:${hw.id}`,
        date: hw.dueDate,
        text: describe(hw),
        hwId: hw.id,
      });
    }

    const ORDER = { lesson: 0, behavior: 1, homework: 2 } as const;
    return [...byDate.entries()]
      .map(([date, entries]) => ({
        date,
        entries: entries.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]),
      }))
      .sort((a, b) => b.date.localeCompare(a.date));
    // describe only depends on `language`, which is in the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, behaviorList, myHomework, language]);

  const handled = (e: Entry) => {
    if (e.kind === 'lesson') return readLessons.has(e.key.slice(2));
    if (e.kind === 'behavior') return readBehavior.has(e.key.slice(2));
    return isHomeworkDone(e.hwId) || e.date < today;
  };

  const openDays = days.filter((d) => d.entries.some((e) => !handled(e)));
  const archivedDays = days.filter((d) => d.entries.every(handled));

  const opened = days.flatMap((d) => d.entries).find((e) => e.key === openKey) || null;

  const formatDate = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  // Optimistic on both marks: the row moves on the tap and comes back if the
  // write fails, rather than the list claiming something was filed that was
  // not.
  const markLessonRead = (id: string) => {
    setReadLessons((prev) => new Set(prev).add(id));
    setOpenKey(null);
    apiRequest('/lesson-reports/read', {
      method: 'POST',
      body: JSON.stringify({ lessonId: id, read: true }),
    }).catch(() => {
      setReadLessons((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  const markBehaviorRead = (id: string) => {
    setReadBehavior((prev) => new Set(prev).add(id));
    setOpenKey(null);
    apiRequest('/behavior-read', {
      method: 'POST',
      body: JSON.stringify({ behaviorId: id, read: true }),
    }).catch(() => {
      setReadBehavior((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  if (days.length === 0) return null;

  const row = (e: Entry) => {
    const isHandled = handled(e);
    const muted = isHandled ? 'text-gray-400' : 'text-gray-800';

    if (e.kind === 'lesson') {
      return (
        <div key={e.key} className="flex items-start gap-3 px-4 py-3">
          <FileText className={`mt-0.5 h-5 w-5 shrink-0 ${isHandled ? 'text-gray-300' : 'text-blue-500'}`} />
          <button type="button" onClick={() => setOpenKey(e.key)} className="group min-w-0 flex-1 text-left">
            <p className={`text-sm font-semibold ${muted} group-hover:text-emerald-700`}>
              {text.lesson}
              {isHandled && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-gray-500">
                  <Check className="h-3 w-3" />
                  {text.read}
                </span>
              )}
            </p>
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{e.summary}</p>
          </button>
          <button
            type="button"
            onClick={() => setOpenKey(e.key)}
            aria-label={text.open}
            className="shrink-0 self-center rounded-lg p-2 text-gray-300 transition hover:bg-gray-50 hover:text-emerald-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      );
    }

    if (e.kind === 'behavior') {
      return (
        <div key={e.key} className="flex items-start gap-3 px-4 py-3">
          <span className={`mt-0.5 shrink-0 ${isHandled ? 'opacity-40' : ''}`}>
            <Face rating={e.rating} />
          </span>
          <button
            type="button"
            onClick={() => e.notes && setOpenKey(e.key)}
            className={`min-w-0 flex-1 text-left ${e.notes ? 'group' : 'cursor-default'}`}
          >
            <p className={`text-sm font-semibold ${muted} ${e.notes ? 'group-hover:text-emerald-700' : ''}`}>
              {text.behavior}
              {isHandled && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-gray-500">
                  <Check className="h-3 w-3" />
                  {text.read}
                </span>
              )}
            </p>
            <p className={`mt-0.5 text-sm ${e.notes ? 'line-clamp-2 text-gray-600' : 'text-gray-400'}`}>
              {e.notes || `${text.ratings[e.rating] || ''} · ${text.noNote}`}
            </p>
          </button>
          {/* A bare smiley with no words has no dialog to read it in, so the
              only way to clear it is here on the row itself. */}
          {!isHandled && (
            <button
              type="button"
              onClick={() => markBehaviorRead(e.key.slice(2))}
              aria-label={text.markRead}
              title={text.markRead}
              className="shrink-0 self-center rounded-lg bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
            >
              <Check className="h-4 w-4" />
            </button>
          )}
        </div>
      );
    }

    const done = isHomeworkDone(e.hwId);
    const overdue = !done && e.date < today;
    return (
      <div key={e.key} className="flex items-start gap-3 px-4 py-3">
        <BookOpen className={`mt-0.5 h-5 w-5 shrink-0 ${done ? 'text-emerald-600' : overdue ? 'text-gray-300' : 'text-red-500'}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${done || overdue ? 'text-gray-400' : 'text-gray-800'}`}>
            {text.homework}
            <span
              className={`ml-2 inline-block rounded-full px-2 py-0.5 align-middle text-[10px] font-semibold ${
                done
                  ? 'bg-emerald-100 text-emerald-700'
                  : overdue
                    ? 'bg-gray-100 text-gray-500'
                    : 'bg-amber-100 text-amber-700'
              }`}
            >
              {done ? text.done : overdue ? text.overdue : text.due}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-gray-500">{e.text}</p>
        </div>
        <button
          type="button"
          onClick={() => onToggle(childId, e.hwId)}
          aria-label={done ? text.markOpen : text.markDone}
          title={done ? text.markOpen : text.markDone}
          className={`shrink-0 self-center rounded-lg p-2 transition ${
            done ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          <Check className="h-4 w-4" />
        </button>
      </div>
    );
  };

  const dayCard = (day: { date: string; entries: Entry[] }, inArchive: boolean) => (
    <div
      key={day.date}
      className={`overflow-hidden rounded-xl border border-gray-200 bg-white ${
        inArchive ? 'opacity-80' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <p className="truncate text-sm font-semibold capitalize text-gray-600">{formatDate(day.date)}</p>
        {inArchive && <Check className="h-4 w-4 shrink-0 text-gray-400" />}
      </div>
      <div className="divide-y divide-gray-100">{day.entries.map(row)}</div>
    </div>
  );

  return (
    <div className="mb-4 sm:mb-6">
      <h2 className="mb-1 text-lg font-semibold text-emerald-800 sm:text-xl">{text.heading}</h2>
      <p className="mb-3 text-xs text-gray-500">{text.intro}</p>

      {openDays.length === 0 ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          {text.allDone}
        </div>
      ) : (
        <div className="space-y-2">{openDays.map((d) => dayCard(d, false))}</div>
      )}

      {archivedDays.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchive ? text.hideArchive : `${text.archive} (${archivedDays.length})`}
          </button>
          {showArchive && <div className="mt-2 space-y-2">{archivedDays.map((d) => dayCard(d, true))}</div>}
        </div>
      )}

      <Modal
        open={!!opened}
        onClose={() => setOpenKey(null)}
        title={opened?.kind === 'behavior' ? text.behavior : text.lesson}
        subtitle={
          opened ? [childName, formatDate(opened.date)].filter(Boolean).join(' · ') : undefined
        }
        closeLabel={text.close}
        footer={
          opened && opened.kind === 'lesson' && !readLessons.has(opened.key.slice(2)) ? (
            <button
              type="button"
              onClick={() => markLessonRead(opened.key.slice(2))}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              {text.markRead}
            </button>
          ) : opened && opened.kind === 'behavior' && !readBehavior.has(opened.key.slice(2)) ? (
            <button
              type="button"
              onClick={() => markBehaviorRead(opened.key.slice(2))}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              {text.markRead}
            </button>
          ) : opened ? (
            <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-400">
              <Archive className="h-4 w-4" />
              {text.read}
            </p>
          ) : null
        }
      >
        {opened?.kind === 'lesson' && (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{opened.summary}</p>
        )}
        {opened?.kind === 'behavior' && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              <Face rating={opened.rating} />
            </span>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {opened.notes || text.noNote}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
