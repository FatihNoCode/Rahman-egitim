import { useEffect, useMemo, useState } from 'react';
import { Archive, BookOpen, Check, CalendarClock, CheckCircle2 } from './EmojiIcons';
import LoadingState from './ui/LoadingState';
import { useMinimumLoading } from '../hooks/useMinimumLoading';

export interface HomeworkItem {
  id: string;
  classId: string;
  studentIds: string[] | null;
  description: string;
  dueDate: string;
}

interface HomeworkViewProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /** The child this list is about. Nothing is shown for anyone else. */
  childId: string;
  childClassId?: string;
  completion: Record<string, boolean>;
  onToggle: (studentId: string, homeworkId: string) => void;
  /** Bump to refetch. */
  refreshKey?: number;
}

const T = {
  nl: {
    open: 'Nog te doen',
    done: 'Afgerond',
    markDone: 'Markeer als afgerond',
    markOpen: 'Markeer als niet afgerond',
    due: 'Inleveren op',
    dueToday: 'Vandaag inleveren',
    dueTomorrow: 'Morgen inleveren',
    overdue: 'Inleverdatum verstreken',
    daysLeft: (n: number) => `Nog ${n} ${n === 1 ? 'dag' : 'dagen'}`,
    none: 'Er staat geen huiswerk open.',
    archive: 'Archief · huiswerk',
    archiveHint: 'Afgerond huiswerk en verstreken inleverdata blijven hier bewaard.',
    hideArchive: 'Archief huiswerk verbergen',
    emptyArchive: 'Het archief is nog leeg.',
    loading: 'Laden...',
  },
  tr: {
    open: 'Yapılacak',
    done: 'Tamamlandı',
    markDone: 'Tamamlandı olarak işaretle',
    markOpen: 'Tamamlanmadı olarak işaretle',
    due: 'Teslim tarihi',
    dueToday: 'Bugün teslim',
    dueTomorrow: 'Yarın teslim',
    overdue: 'Teslim tarihi geçti',
    daysLeft: (n: number) => `${n} gün kaldı`,
    none: 'Bekleyen ödev yok.',
    archive: 'Arşiv · ödevler',
    archiveHint: 'Tamamlanan ödevler ve teslim tarihi geçenler burada saklanır.',
    hideArchive: 'Ödev arşivini gizle',
    emptyArchive: 'Arşiv henüz boş.',
    loading: 'Yükleniyor...',
  },
};

// Local day, not toISOString(): for anyone in the Netherlands the UTC day is
// still yesterday for the first two hours after midnight, which would archive
// today's homework a day early.
function localDay() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysBetween(fromYmd: string, toYmd: string) {
  const a = Date.parse(`${fromYmd}T00:00:00`);
  const b = Date.parse(`${toYmd}T00:00:00`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * Huiswerk, as its own destination.
 *
 * It used to live inside the agenda, where a piece of homework was only
 * visible if you happened to tap the square of the day it was due — which is
 * the one day it is already too late to start it. A parent's question is never
 * "what is due on the 14th", it is "is there anything outstanding"; this is a
 * list that answers that, in deadline order.
 *
 * Colour carries the state, and only two states exist: green for done, red for
 * not. It is deliberately a left edge and a small pill rather than a filled
 * card — a screen of solid red reads as an emergency, and a reading assignment
 * for next Saturday is not one.
 *
 * Anything that is finished, or whose deadline has passed, moves to the
 * archive on its own. Nothing is ever deleted: a parent asked to account for a
 * term's homework can still find it.
 */
export default function HomeworkView({
  language,
  apiRequest,
  childId,
  childClassId,
  completion,
  onToggle,
  refreshKey = 0,
}: HomeworkViewProps) {
  const text = T[language];
  const [homework, setHomework] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const showLoading = useMinimumLoading(loading);
  const [showArchive, setShowArchive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    apiRequest('/homework')
      .then((res) => {
        if (!cancelled) setHomework(res?.homework || []);
      })
      .catch(() => {
        if (!cancelled) setHomework([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [apiRequest, refreshKey]);

  const today = localDay();

  // The server hands a parent every piece of homework aimed at any of their
  // children, plus every whole-class assignment. Whole-class rows carry no
  // student ids at all, so without the class check a family with children in
  // two classes would see both classes' work under one child's name.
  const mine = useMemo(
    () =>
      (homework || []).filter((hw) => {
        if (!hw?.id) return false;
        if (Array.isArray(hw.studentIds)) return hw.studentIds.includes(childId);
        return !!childClassId && hw.classId === childClassId;
      }),
    [homework, childId, childClassId],
  );

  const isDone = (hw: HomeworkItem) => !!completion[`${childId}:${hw.id}`];

  const open = mine
    .filter((hw) => !isDone(hw) && (!hw.dueDate || hw.dueDate >= today))
    .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
  const archived = mine
    .filter((hw) => isDone(hw) || (hw.dueDate && hw.dueDate < today))
    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));

  // Homework is stored as "Turkish | Dutch" in one field.
  const describe = (hw: HomeworkItem) => {
    const parts = (hw.description || '').split(' | ');
    return (language === 'tr' ? parts[0] : parts[1] || parts[0]) || '';
  };

  const dueLabel = (hw: HomeworkItem) => {
    if (!hw.dueDate) return '';
    const diff = daysBetween(today, hw.dueDate);
    if (diff < 0) return text.overdue;
    if (diff === 0) return text.dueToday;
    if (diff === 1) return text.dueTomorrow;
    return text.daysLeft(diff);
  };

  const formatDate = (ymd: string) => {
    if (!ymd) return '';
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    });
  };

  const card = (hw: HomeworkItem) => {
    const done = isDone(hw);
    const overdue = !done && !!hw.dueDate && hw.dueDate < today;
    const accent = done ? 'border-l-emerald-500' : 'border-l-red-500';
    return (
      <div
        key={hw.id}
        className={`rounded-xl border border-gray-200 border-l-4 bg-white p-4 ${accent}`}
      >
        <div className="flex items-start gap-3">
          <BookOpen className={`mt-0.5 h-5 w-5 shrink-0 ${done ? 'text-emerald-600' : 'text-red-500'}`} />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-gray-800">{describe(hw)}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="h-3.5 w-3.5" />
                {text.due} {formatDate(hw.dueDate)}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  done
                    ? 'bg-emerald-100 text-emerald-700'
                    : overdue
                      ? 'bg-red-100 text-red-700'
                      : 'bg-amber-100 text-amber-700'
                }`}
              >
                {done ? text.done : dueLabel(hw)}
              </span>
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(childId, hw.id)}
          className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition active:scale-95 ${
            done
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : null}
          {done ? text.markOpen : text.markDone}
        </button>
      </div>
    );
  };

  if (showLoading) {
    return <LoadingState compact label={text.loading} />;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {open.length === 0 ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            <CheckCircle2 className="h-5 w-5 shrink-0" />
            {text.none}
          </div>
        ) : (
          open.map(card)
        )}
      </div>

      <div>
        <button
          type="button"
          onClick={() => setShowArchive((v) => !v)}
          aria-expanded={showArchive}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
        >
          <Archive className="h-3.5 w-3.5" />
          {showArchive ? text.hideArchive : `${text.archive} (${archived.length})`}
        </button>
        {showArchive && (
          <div className="mt-2 space-y-2">
            <p className="text-xs text-gray-400">{text.archiveHint}</p>
            {archived.length === 0 ? (
              <p className="text-sm text-gray-400">{text.emptyArchive}</p>
            ) : (
              archived.map(card)
            )}
          </div>
        )}
      </div>
    </div>
  );
}
