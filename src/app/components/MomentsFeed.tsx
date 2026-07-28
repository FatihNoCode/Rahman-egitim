import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Award, MessageCircle, Trash2 } from 'lucide-react';

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
}

export default function MomentsFeed({
  language,
  apiRequest,
  filterStudentId,
  allowDelete = false,
  refreshKey = 0,
  limit = 8,
}: MomentsFeedProps) {
  const tr = language === 'tr';
  const text = tr
    ? { title: 'Güzel anlar', empty: 'Henüz paylaşılan bir an yok.', remove: 'Kaldır' }
    : { title: 'Mooie momenten', empty: 'Er zijn nog geen momenten gedeeld.', remove: 'Verwijderen' };

  const [moments, setMoments] = useState<Moment[]>([]);
  const [loaded, setLoaded] = useState(false);

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

  const remove = async (id: string) => {
    setMoments((prev) => prev.filter((m) => m.id !== id));
    try {
      await apiRequest(`/moments/${id}`, { method: 'DELETE' });
    } catch {
      load();
    }
  };

  const visible = (filterStudentId
    ? moments.filter((m) => m.studentIds.includes(filterStudentId))
    : moments
  ).slice(0, limit);

  // Before the first response there is nothing honest to show, and an empty
  // "no moments yet" that flickers into a full list reads as a glitch.
  if (!loaded) return null;

  return (
    <div className="mb-4 sm:mb-6">
      <h2 className="text-lg sm:text-xl font-semibold text-emerald-800 mb-3">{text.title}</h2>

      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm text-gray-500">{text.empty}</div>
      ) : (
        <div className="space-y-2">
          {visible.map((moment) => {
            const style = KIND_STYLE[moment.kind] || KIND_STYLE.praise;
            const Icon = style.icon;
            const label = KIND_LABEL[moment.kind] || KIND_LABEL.praise;
            return (
              <div key={moment.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-3">
                <span className={`shrink-0 rounded-lg p-2 ${style.ring}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${style.chip}`}>
                      {tr ? label.tr : label.nl}
                    </span>
                    {/* Only worth naming the child when the reader has more
                        than one, which the caller decides by filtering. */}
                    {!filterStudentId && moment.studentNames.filter(Boolean).length > 0 && (
                      <span className="text-xs text-gray-500">{moment.studentNames.filter(Boolean).join(', ')}</span>
                    )}
                  </div>
                  <p className="text-gray-800">{moment.text}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(moment.createdAt).toLocaleDateString(tr ? 'tr-TR' : 'nl-NL', {
                      day: 'numeric',
                      month: 'long',
                    })}
                    {moment.createdByName ? ` · ${moment.createdByName}` : ''}
                  </p>
                </div>
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
          })}
        </div>
      )}
    </div>
  );
}
