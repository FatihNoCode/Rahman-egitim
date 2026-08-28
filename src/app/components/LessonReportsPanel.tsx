import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ChevronRight, FileText } from 'lucide-react';
import Modal from './ui/modal';
import { getReadIds, setRead } from '../../lib/readState';

export interface LessonReport {
  id: string;
  date: string;
  summary: string;
}

interface LessonReportsPanelProps {
  language: 'tr' | 'nl';
  /** Whose lessons these are — read marks are kept per child. */
  childId: string;
  lessons: LessonReport[];
}

const T = {
  nl: {
    title: 'Lesverslag',
    open: 'Openen',
    markRead: 'Markeer als gelezen',
    read: 'Gelezen',
    archive: 'Archief',
    archiveHint: 'Gelezen lesverslagen',
    none: 'Nog geen lesverslagen.',
    hideArchive: 'Archief verbergen',
  },
  tr: {
    title: 'Ders özeti',
    open: 'Aç',
    markRead: 'Okundu olarak işaretle',
    read: 'Okundu',
    archive: 'Arşiv',
    archiveHint: 'Okunan ders özetleri',
    none: 'Henüz ders özeti yok.',
    hideArchive: 'Arşivi gizle',
  },
};

const SCOPE = 'lesverslag';

/**
 * Lesson reports, moved out of the agenda.
 *
 * In the calendar a lesverslag was something you could only find by guessing
 * which square it was behind — it was written *to* the parent but filed by
 * date, so the one thing the teacher wanted read was the one thing nobody
 * saw. Here it sits in the worklist with everything else that wants attention,
 * is read in a dialog, and leaves the list the moment it has been read.
 *
 * "Gelezen" archives rather than deletes: a parent who wants to check what was
 * covered three weeks ago still can (see readState for where the mark lives).
 */
export default function LessonReportsPanel({ language, childId, lessons }: LessonReportsPanelProps) {
  const text = T[language];
  const [readIds, setReadIds] = useState<Set<string>>(() => getReadIds(SCOPE, childId));
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);

  // Switching child switches which marks apply.
  useEffect(() => {
    setReadIds(getReadIds(SCOPE, childId));
    setOpenId(null);
    setShowArchive(false);
  }, [childId]);

  const sorted = useMemo(
    () => (lessons || []).filter((l) => l && l.id).slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    [lessons],
  );
  const unread = sorted.filter((l) => !readIds.has(l.id));
  const archived = sorted.filter((l) => readIds.has(l.id));

  const opened = sorted.find((l) => l.id === openId) || null;

  const formatDate = (ymd: string) => {
    if (!ymd) return '';
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const markRead = (id: string) => {
    setReadIds(new Set(setRead(SCOPE, childId, id, true)));
    setOpenId(null);
  };

  if (sorted.length === 0) return null;

  const row = (lesson: LessonReport, isRead: boolean) => (
    <div
      key={lesson.id}
      className={`flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 ${
        isRead ? 'border-l-4 border-l-gray-300' : 'border-l-4 border-l-blue-500'
      }`}
    >
      <FileText className={`mt-0.5 h-5 w-5 shrink-0 ${isRead ? 'text-gray-400' : 'text-blue-500'}`} />
      <button
        type="button"
        onClick={() => setOpenId(lesson.id)}
        className="group min-w-0 flex-1 text-left"
      >
        <p className="font-medium text-gray-800 group-hover:text-emerald-700">
          {text.title}
          {isRead && (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-gray-500">
              <Check className="h-3 w-3" />
              {text.read}
            </span>
          )}
        </p>
        <p className="mt-1 text-sm capitalize text-gray-500">{formatDate(lesson.date)}</p>
        <p className="mt-1 line-clamp-2 text-sm text-gray-400">{lesson.summary}</p>
      </button>
      <button
        type="button"
        onClick={() => setOpenId(lesson.id)}
        aria-label={text.open}
        className="inline-flex shrink-0 items-center gap-1 self-center rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        <span className="hidden sm:inline">{text.open}</span>
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <>
      {unread.map((l) => row(l, false))}

      {archived.length > 0 && (
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
          {showArchive && <div className="mt-2 space-y-2">{archived.map((l) => row(l, true))}</div>}
        </div>
      )}

      <Modal
        open={!!opened}
        onClose={() => setOpenId(null)}
        title={text.title}
        subtitle={opened ? formatDate(opened.date) : undefined}
        closeLabel={language === 'tr' ? 'Kapat' : 'Sluiten'}
        footer={
          opened && !readIds.has(opened.id) ? (
            <button
              type="button"
              onClick={() => markRead(opened.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <Check className="h-4 w-4" />
              {text.markRead}
            </button>
          ) : opened ? (
            <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-400">
              <Archive className="h-4 w-4" />
              {text.read} · {text.archiveHint}
            </p>
          ) : null
        }
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{opened?.summary}</p>
      </Modal>
    </>
  );
}
