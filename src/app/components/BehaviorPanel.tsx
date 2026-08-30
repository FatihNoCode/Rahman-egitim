import { useMemo, useState } from 'react';
import { Frown, Meh, Smile, ChevronRight } from 'lucide-react';
import Modal from './ui/modal';

export interface BehaviorRecord {
  date: string;
  rating: number;
  notes?: string;
}

interface BehaviorPanelProps {
  language: 'tr' | 'nl';
  behaviorList: BehaviorRecord[];
  /** Whose remarks these are — named in the dialog, since siblings share a screen. */
  childName?: string;
  /** How many entries to show before "toon alles". */
  limit?: number;
}

const T = {
  nl: {
    title: 'Gedrag',
    intro: 'Wat de docent over het gedrag van uw kind noteerde.',
    none: 'Nog geen opmerkingen over gedrag.',
    noNote: 'Geen toelichting',
    showAll: 'Alles tonen',
    showLess: 'Minder tonen',
    ratings: ['', 'Moeilijke les', 'Moeilijke les', 'Neutraal', 'Neutraal', 'Goed'],
  },
  tr: {
    title: 'Davranış',
    intro: 'Öğretmenin çocuğunuzun davranışı hakkında yazdıkları.',
    none: 'Henüz davranış notu yok.',
    noNote: 'Ek açıklama yok',
    showAll: 'Tümünü göster',
    showLess: 'Daha az göster',
    ratings: ['', 'Zor bir ders', 'Zor bir ders', 'Normal', 'Normal', 'İyi'],
  },
};

function Face({ rating }: { rating: number }) {
  if (rating <= 2) return <Frown className="h-5 w-5 text-red-500" />;
  if (rating <= 4) return <Meh className="h-5 w-5 text-amber-500" />;
  return <Smile className="h-5 w-5 text-emerald-500" />;
}

/**
 * Behaviour remarks, moved off the agenda.
 *
 * On the calendar a remark about a child was filed by date behind a square,
 * which meant a parent could only find it by clicking through days on the
 * off-chance. It is not an appointment — it is the teacher speaking about
 * their child, and it is one of the few things a family opens the app hoping
 * to read. So it gets a place of its own on the home screen, newest first,
 * with the note in full one tap away.
 *
 * Only remarks with something written are worth interrupting for at the top
 * level; a bare smiley with no words is still listed, but reads as the small
 * factual line it is.
 */
export default function BehaviorPanel({ language, behaviorList, childName, limit = 4 }: BehaviorPanelProps) {
  const text = T[language];
  const [expanded, setExpanded] = useState(false);
  const [openDate, setOpenDate] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      (behaviorList || [])
        .filter((b) => b && b.date && typeof b.rating === 'number')
        .slice()
        .sort((a, b) => b.date.localeCompare(a.date)),
    [behaviorList],
  );

  if (sorted.length === 0) return null;

  const shown = expanded ? sorted : sorted.slice(0, limit);
  const opened = sorted.find((b) => b.date === openDate) || null;

  const formatDate = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  return (
    <div className="mb-4 sm:mb-6">
      <h2 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-1">{text.title}</h2>
      <p className="mb-3 text-xs text-gray-500">{text.intro}</p>

      <div className="space-y-2">
        {shown.map((b) => {
          const note = (b.notes || '').trim();
          return (
            <button
              key={b.date}
              type="button"
              onClick={() => note && setOpenDate(b.date)}
              className={`flex w-full items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 text-left ${
                note ? 'transition hover:border-emerald-300' : 'cursor-default'
              }`}
            >
              <span className="mt-0.5 shrink-0">
                <Face rating={b.rating} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium capitalize text-gray-800">{formatDate(b.date)}</span>
                <span className={`mt-1 block text-sm ${note ? 'line-clamp-2 text-gray-600' : 'text-gray-400'}`}>
                  {note || `${text.ratings[b.rating] || ''} · ${text.noNote}`}
                </span>
              </span>
              {note && <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 self-center text-gray-300" />}
            </button>
          );
        })}
      </div>

      {sorted.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-900"
        >
          {expanded ? text.showLess : `${text.showAll} (${sorted.length})`}
        </button>
      )}

      <Modal
        open={!!opened}
        onClose={() => setOpenDate(null)}
        title={text.title}
        subtitle={
          opened ? [childName, formatDate(opened.date)].filter(Boolean).join(' · ') : undefined
        }
        closeLabel={language === 'tr' ? 'Kapat' : 'Sluiten'}
      >
        {opened && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 shrink-0">
              <Face rating={opened.rating} />
            </span>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
              {(opened.notes || '').trim() || text.noNote}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
