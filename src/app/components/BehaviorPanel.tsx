import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, ChevronRight, Frown, Meh, Smile } from 'lucide-react';
import Modal from './ui/modal';

export interface BehaviorRecord {
  /** The record's own id. Older backends may not send one — see idOf. */
  id?: string;
  date: string;
  rating: number;
  notes?: string;
}

// The read mark is stored under this. `id` is what the server writes on every
// behaviour record; the date fallback keeps a phone running against an older
// deployment from filing every remark under the same key.
const idOf = (b: BehaviorRecord) => b.id || `d${b.date}`;

interface BehaviorPanelProps {
  language: 'tr' | 'nl';
  behaviorList: BehaviorRecord[];
  /** Whose remarks these are — named in the dialog, since siblings share a screen. */
  childName?: string;
  /** How many entries to show before "toon alles". */
  limit?: number;
  /**
   * Enables the read/archive half of the panel. Without it every remark stays
   * on the home screen forever, which is how this started.
   */
  apiRequest?: (endpoint: string, options?: RequestInit) => Promise<any>;
}

const T = {
  nl: {
    title: 'Gedrag',
    intro: 'Wat de docent over het gedrag van uw kind noteerde.',
    none: 'Nog geen opmerkingen over gedrag.',
    noNote: 'Geen toelichting',
    showAll: 'Alles tonen',
    showLess: 'Minder tonen',
    markRead: 'Gelezen, archiveren',
    read: 'Gelezen',
    // Named, not just "Archief": this is the third archive button on the
    // parent's home screen and they sit within a screen height of each other.
    archive: 'Archief · gedrag',
    hideArchive: 'Archief gedrag verbergen',
    archiveHint: 'Gelezen opmerkingen over gedrag',
    ratings: ['', 'Moeilijke les', 'Moeilijke les', 'Neutraal', 'Neutraal', 'Goed'],
  },
  tr: {
    title: 'Davranış',
    intro: 'Öğretmenin çocuğunuzun davranışı hakkında yazdıkları.',
    none: 'Henüz davranış notu yok.',
    noNote: 'Ek açıklama yok',
    showAll: 'Tümünü göster',
    showLess: 'Daha az göster',
    markRead: 'Okundu, arşivle',
    read: 'Okundu',
    archive: 'Arşiv · davranış',
    hideArchive: 'Davranış arşivini gizle',
    archiveHint: 'Okunan davranış notları',
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
 * Read remarks are archived rather than shown forever. Every remark used to
 * stay at the top of the home screen for the rest of the year, so a list that
 * exists to say "here is something new the teacher wrote" gradually became a
 * wall that said nothing — and the one genuinely new remark sat in it looking
 * exactly like the forty that had already been read. "Gelezen" files it away;
 * nothing is deleted, and the archive is one tap below.
 */
export default function BehaviorPanel({
  language,
  behaviorList,
  childName,
  limit = 4,
  apiRequest,
}: BehaviorPanelProps) {
  const text = T[language];
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!apiRequest) return;
    let cancelled = false;
    apiRequest('/behavior-read')
      .then((res) => {
        if (!cancelled) setReadIds(new Set<string>((res?.read || []).map(String)));
      })
      // A failed load leaves everything unread, which shows the parent too
      // much rather than too little — the safe direction for something the
      // teacher wrote about their child.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiRequest]);

  const sorted = useMemo(
    () =>
      (behaviorList || [])
        .filter((b) => b && b.date && typeof b.rating === 'number')
        .map((b) => ({ ...b, key: idOf(b) }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [behaviorList],
  );

  const canArchive = !!apiRequest;
  const unread = canArchive ? sorted.filter((b) => !readIds.has(b.key)) : sorted;
  const archived = canArchive ? sorted.filter((b) => readIds.has(b.key)) : [];

  if (sorted.length === 0) return null;

  const shown = expanded ? unread : unread.slice(0, limit);
  const opened = sorted.find((b) => b.key === openId) || null;

  const markRead = (key: string) => {
    if (!apiRequest) return;
    // Optimistic, like the lesverslag list: the entry moves to the archive on
    // the tap and comes back if the write fails, rather than the list claiming
    // something was filed that was not.
    setReadIds((prev) => new Set(prev).add(key));
    setOpenId(null);
    apiRequest('/behavior-read', {
      method: 'POST',
      body: JSON.stringify({ behaviorId: key, read: true }),
    }).catch(() => {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    });
  };

  const formatDate = (ymd: string) => {
    const d = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(d.getTime())) return ymd;
    return d.toLocaleDateString(language === 'tr' ? 'tr-TR' : 'nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const row = (b: BehaviorRecord & { key: string }, isRead: boolean) => {
    const note = (b.notes || '').trim();
    return (
      <div
        key={b.key}
        className={`flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 ${
          isRead ? 'border-l-4 border-l-gray-300 opacity-80' : ''
        }`}
      >
        <span className="mt-0.5 shrink-0">
          <Face rating={b.rating} />
        </span>
        <button
          type="button"
          onClick={() => note && setOpenId(b.key)}
          className={`min-w-0 flex-1 text-left ${note ? 'group' : 'cursor-default'}`}
        >
          <span className="block text-sm font-medium capitalize text-gray-800">
            {formatDate(b.date)}
            {isRead && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 align-middle text-[10px] font-semibold text-gray-500">
                <Check className="h-3 w-3" />
                {text.read}
              </span>
            )}
          </span>
          <span className={`mt-1 block text-sm ${note ? 'line-clamp-2 text-gray-600' : 'text-gray-400'}`}>
            {note || `${text.ratings[b.rating] || ''} · ${text.noNote}`}
          </span>
        </button>
        {note && (
          <button
            type="button"
            onClick={() => setOpenId(b.key)}
            aria-label={language === 'tr' ? 'Aç' : 'Openen'}
            className="shrink-0 self-center rounded-lg p-2 text-gray-300 transition hover:bg-gray-50 hover:text-emerald-600"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}
        {/* A bare smiley with no words has no dialog to read it in, so the
            only way to clear it is here on the row itself. */}
        {canArchive && !isRead && (
          <button
            type="button"
            onClick={() => markRead(b.key)}
            aria-label={text.markRead}
            title={text.markRead}
            className="shrink-0 self-center rounded-lg bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
          >
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mb-4 sm:mb-6">
      <h2 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-1">{text.title}</h2>
      <p className="mb-3 text-xs text-gray-500">{text.intro}</p>

      {unread.length === 0 ? (
        <p className="text-sm text-gray-400">
          {language === 'tr' ? 'Okunmamış davranış notu yok.' : 'Er staan geen ongelezen opmerkingen open.'}
        </p>
      ) : (
        <div className="space-y-2">{shown.map((b) => row(b, false))}</div>
      )}

      {unread.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-emerald-700 hover:text-emerald-900"
        >
          {expanded ? text.showLess : `${text.showAll} (${unread.length})`}
        </button>
      )}

      {archived.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowArchive((v) => !v)}
            aria-expanded={showArchive}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-500 transition hover:bg-gray-50"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchive ? text.hideArchive : `${text.archive} (${archived.length})`}
          </button>
          {showArchive && <div className="mt-2 space-y-2">{archived.map((b) => row(b, true))}</div>}
        </div>
      )}

      <Modal
        open={!!opened}
        onClose={() => setOpenId(null)}
        title={text.title}
        subtitle={
          opened ? [childName, formatDate(opened.date)].filter(Boolean).join(' · ') : undefined
        }
        closeLabel={language === 'tr' ? 'Kapat' : 'Sluiten'}
        footer={
          opened && canArchive ? (
            readIds.has(opened.key) ? (
              <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-gray-400">
                <Archive className="h-4 w-4" />
                {text.read} · {text.archiveHint}
              </p>
            ) : (
              <button
                type="button"
                onClick={() => markRead(opened.key)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <Check className="h-4 w-4" />
                {text.markRead}
              </button>
            )
          ) : null
        }
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
