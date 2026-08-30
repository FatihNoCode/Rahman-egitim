import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Award, MessageCircle, Trash2, Archive, Check } from 'lucide-react';

/**
 * The good-news feed: short notes a teacher wrote about a child.
 *
 * This is the only surface in the app that exists purely to carry something
 * pleasant. That is not sentiment — it is what makes the rest of the system
 * work. Every other message a family gets from a school is an obligation or a
 * problem, and a channel carrying only bad news is one people learn to avoid;
 * the parent who stops opening the app is precisely the parent you most need
 * to reach when something is actually wrong.
 *
 * Read-only for parents, and short by construction: three or four lines a week
 * per child, not a timeline to scroll.
 */

export interface Moment {
  id: string;
  kind: 'praise' | 'milestone' | 'note';
  text: string;
  createdAt: string;
  createdByName?: string;
  studentIds: string[];
  studentNames: string[];
}

const KIND_STYLE: Record<Moment['kind'], { icon: typeof Sparkles; ring: string; chip: string }> = {
  praise: { icon: Sparkles, ring: 'bg-amber-50 text-amber-600', chip: 'bg-amber-100 text-amber-700' },
  milestone: { icon: Award, ring: 'bg-emerald-50 text-emerald-600', chip: 'bg-emerald-100 text-emerald-700' },
  note: { icon: MessageCircle, ring: 'bg-blue-50 text-blue-600', chip: 'bg-blue-100 text-blue-700' },
};

const KIND_LABEL: Record<Moment['kind'], { nl: string; tr: string }> = {
  praise: { nl: 'Compliment', tr: 'Takdir' },
  milestone: { nl: 'Mijlpaal', tr: 'Dönüm noktası' },
  note: { nl: 'Notitie', tr: 'Not' },
};

interface MomentsFeedProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /** Show only this child's moments — the parent's child switcher drives it. */
  filterStudentId?: string;
  /** Staff can retract what they wrote; parents cannot. */
  allowDelete?: boolean;
  refreshKey?: number;
  /** Cap the list. The parent home wants a glance, not an archive. */
  limit?: number;
  /**
   * Render nothing at all when there is nothing to show, heading included.
   *
   * For parents this is the honest behaviour. Not every teacher writes these,
   * and a permanently empty "Güzel anlar" box on a family's home screen reads
   * as either a broken feature or a verdict on their child. The nudge to write
   * one belongs on the teacher's screen, not as a hole on the parent's.
   */
  hideWhenEmpty?: boolean;
  /**
   * Let the reader file a moment away once they have read it.
   *
   * A compliment or a mijlpaal is written once and then stands on the home
   * screen for the rest of the year, which is how a feed of good news turns
   * into wallpaper — the one new thing looks exactly like the twelve already
   * read. Archiving is per account and server-side (see /moments-read), the
   * same as the lesverslag and gedrag marks, so reading on the phone does not
   * leave the tablet still calling it new. Nothing is deleted.
   */
  allowArchive?: boolean;
}

export default function MomentsFeed({
  language,
  apiRequest,
  filterStudentId,
  allowDelete = false,
  refreshKey = 0,
  limit = 8,
  hideWhenEmpty = false,
  allowArchive = false,
}: MomentsFeedProps) {
  const tr = language === 'tr';
  const text = tr
    ? {
        title: 'Güzel anlar',
        empty: 'Henüz paylaşılan bir an yok.',
        remove: 'Kaldır',
        markRead: 'Okundu, arşivle',
        read: 'Okundu',
        archive: 'Arşiv · güzel anlar',
        hideArchive: 'Güzel anlar arşivini gizle',
        allRead: 'Tüm güzel anları okudunuz.',
      }
    : {
        title: 'Mooie momenten',
        empty: 'Er zijn nog geen momenten gedeeld.',
        remove: 'Verwijderen',
        markRead: 'Gelezen, archiveren',
        read: 'Gelezen',
        archive: 'Archief · mooie momenten',
        hideArchive: 'Archief mooie momenten verbergen',
        allRead: 'U heeft alle momenten gelezen.',
      };

  const [moments, setMoments] = useState<Moment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [showArchive, setShowArchive] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiRequest('/moments');
      setMoments(res?.moments || []);
    } catch {
      setMoments([]);
    } finally {
      setLoaded(true);
    }
  }, [apiRequest]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  useEffect(() => {
    if (!allowArchive) return;
    let cancelled = false;
    // A failed load leaves everything unread, which shows too much rather than
    // too little — the safe direction for something written about a child.
    apiRequest('/moments-read')
      .then((res) => {
        if (!cancelled) setReadIds(new Set<string>((res?.read || []).map(String)));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [apiRequest, allowArchive]);

  // Optimistic: the card moves to the archive on the tap and comes back if the
  // write fails, rather than the list claiming something was filed that was not.
  const markRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
    apiRequest('/moments-read', {
      method: 'POST',
      body: JSON.stringify({ momentId: id, read: true }),
    }).catch(() => {
      setReadIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    });
  };

  const remove = async (id: string) => {
    setMoments((prev) => prev.filter((m) => m.id !== id));
    try {
      await apiRequest(`/moments/${id}`, { method: 'DELETE' });
    } catch {
      load();
    }
  };

  const mine = filterStudentId
    ? moments.filter((m) => m.studentIds.includes(filterStudentId))
    : moments;
  const visible = (allowArchive ? mine.filter((m) => !readIds.has(m.id)) : mine).slice(0, limit);
  const archived = allowArchive ? mine.filter((m) => readIds.has(m.id)) : [];

  // Before the first response there is nothing honest to show, and an empty
  // "no moments yet" that flickers into a full list reads as a glitch.
  if (!loaded) return null;
  if (hideWhenEmpty && visible.length === 0 && archived.length === 0) return null;

  const card = (moment: Moment, inArchive: boolean) => {
    const style = KIND_STYLE[moment.kind] || KIND_STYLE.praise;
    const Icon = style.icon;
    const label = KIND_LABEL[moment.kind] || KIND_LABEL.praise;
    return (
      <div
        key={moment.id}
        className={`bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3 ${
          inArchive ? 'opacity-80' : ''
        }`}
      >
        <span className={`shrink-0 rounded-lg p-2 ${inArchive ? 'bg-gray-100 text-gray-400' : style.ring}`}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                inArchive ? 'bg-gray-100 text-gray-500' : style.chip
              }`}
            >
              {tr ? label.tr : label.nl}
            </span>
            {inArchive && (
              <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">
                <Check className="h-3 w-3" />
                {text.read}
              </span>
            )}
            {/* Only worth naming the child when the reader has more
                than one, which the caller decides by filtering. */}
            {!filterStudentId && moment.studentNames.filter(Boolean).length > 0 && (
              <span className="text-xs text-gray-500">{moment.studentNames.filter(Boolean).join(', ')}</span>
            )}
          </div>
          <p className={inArchive ? 'text-gray-500' : 'text-gray-800'}>{moment.text}</p>
          <p className="text-xs text-gray-400 mt-1">
            {new Date(moment.createdAt).toLocaleDateString(tr ? 'tr-TR' : 'nl-NL', {
              day: 'numeric',
              month: 'long',
            })}
            {moment.createdByName ? ` · ${moment.createdByName}` : ''}
          </p>
        </div>
        {allowArchive && !inArchive && (
          <button
            onClick={() => markRead(moment.id)}
            title={text.markRead}
            aria-label={text.markRead}
            className="shrink-0 self-center rounded-lg bg-emerald-50 p-2 text-emerald-700 transition hover:bg-emerald-100"
          >
            <Check className="w-4 h-4" />
          </button>
        )}
        {allowDelete && (
          <button
            onClick={() => remove(moment.id)}
            title={text.remove}
            aria-label={text.remove}
            className="shrink-0 text-gray-300 hover:text-red-600 transition"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mb-4 sm:mb-6">
      <h2 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-3">{text.title}</h2>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-500">
          {allowArchive && archived.length > 0 ? text.allRead : text.empty}
        </div>
      ) : (
        <div className="space-y-2">{visible.map((m) => card(m, false))}</div>
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
          {showArchive && <div className="mt-2 space-y-2">{archived.map((m) => card(m, true))}</div>}
        </div>
      )}
    </div>
  );
}
