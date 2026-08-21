import { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { childAccent, childInitial } from './childIdentity';

/**
 * "Wat vraagt om uw aandacht" — the parent's worklist.
 *
 * Every other role in this app opens onto a list of what is waiting on them.
 * A parent opened onto a calendar and was left to infer it. This is the same
 * idea served to the other side of the school gate: the handful of things only
 * this family can do, in the order they matter.
 *
 * Two deliberate differences from the staff version (SignalsView):
 *
 *   • **Nothing can be ticked off.** Every entry describes something only the
 *     parent can resolve, and resolving it makes the entry disappear by
 *     itself. A checkbox would let "your child was absent and we never heard
 *     why" be silenced without ever being answered — the one outcome the
 *     feature exists to prevent.
 *   • **It disappears when it is empty.** A permanent card reading "niets te
 *     doen" trains people to scroll past the spot where the real thing will
 *     one day appear.
 *
 * Items come from buildParentFeed on the server; each carries the tab it is
 * resolved on, which `onNavigate` turns into a destination.
 */

type Level = 'high' | 'medium' | 'low';

export interface ActionItem {
  key: string;
  level: Level;
  titleNl: string;
  titleTr: string;
  bodyNl: string;
  bodyTr: string;
  link?: string;
  count?: number;
}

interface ActionCenterProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /** '#billing' -> the billing tab, '#account' -> the account panel, … */
  onNavigate?: (link: string) => void;
  /** Bumping this refetches — used after an action elsewhere resolves an item. */
  refreshKey?: number;
  /**
   * Say so when there is nothing outstanding, instead of rendering nothing.
   *
   * Only the parent's home tab wants this: a family that opens the app to
   * check on their child deserves an answer, and "niets te doen" *is* the
   * answer. Everywhere else silence is better than a permanent empty card.
   */
  showAllClear?: boolean;
  /**
   * The family's children, in the order the child switcher shows them.
   *
   * This is the one parent surface that deliberately spans *every* child, so
   * it is also the one place where two entries side by side can be about two
   * different people. Given the list, each entry gets the child's colour and
   * initial (see childIdentity) — the list becomes scannable by colour, and
   * the reader can tell the two apart before reading a word. Omit it, or pass
   * a single child, and the badges are left off entirely.
   */
  childrenList?: { id: string; name: string }[];
}

const LEVEL_STYLES: Record<Level, { border: string; dot: string }> = {
  high: { border: 'border-l-4 border-l-red-500', dot: 'bg-red-500' },
  medium: { border: 'border-l-4 border-l-amber-500', dot: 'bg-amber-500' },
  low: { border: 'border-l-4 border-l-blue-400', dot: 'bg-blue-400' },
};

export default function ActionCenter({
  language,
  apiRequest,
  onNavigate,
  refreshKey = 0,
  showAllClear = false,
  childrenList = [],
}: ActionCenterProps) {
  const tr = language === 'tr';
  const text = tr
    ? {
        title: 'Sizden bekleyenler',
        allClear: 'Şu anda yapmanız gereken bir şey yok.',
        refresh: 'Yenile',
        open: 'Aç',
      }
    : {
        title: 'Wat om uw aandacht vraagt',
        allClear: 'Er staat op dit moment niets open.',
        refresh: 'Vernieuwen',
        open: 'Openen',
      };

  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  // A parent has one job on this screen and it is not diagnosing our server.
  // A failed load renders as nothing at all rather than as an error card that
  // they can neither act on nor dismiss.
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/signals/today');
      setItems(res?.feed || []);
      setFailed(false);
    } catch {
      setFailed(true);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // Nothing to say, or nothing to say *yet* — either way, take up no room.
  if (loading || failed) return null;
  if (items.length === 0) {
    if (!showAllClear) return null;
    return (
      <div className="mb-4 sm:mb-6 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <CheckCircle2 className="w-5 h-5 shrink-0" />
        {text.allClear}
      </div>
    );
  }

  const label = (item: ActionItem) => (tr ? item.titleTr : item.titleNl);
  const body = (item: ActionItem) => (tr ? item.bodyTr : item.bodyNl);

  // Which child an entry is about. Every per-child key and link the server
  // builds carries the student id (`parent_billing:<id>`, `#billing:<id>`);
  // account-level entries such as the missing phone number carry neither, and
  // correctly get no badge.
  const showBadges = childrenList.length > 1;
  const childFor = (item: ActionItem) => {
    if (!showBadges) return null;
    const haystack = `${item.key}:${item.link || ''}`;
    const i = childrenList.findIndex((c) => haystack.includes(c.id));
    return i < 0 ? null : { child: childrenList[i], accent: childAccent(i) };
  };

  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-semibold text-emerald-800">{text.title}</h2>
        <button
          onClick={load}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {text.refresh}
        </button>
      </div>

      <div className="space-y-2">
        {items.map((item) => {
          const clickable = !!item.link && !!onNavigate;
          return (
            <div
              key={item.key}
              className={`bg-white border border-gray-200 rounded-xl ${LEVEL_STYLES[item.level].border} flex items-start gap-3 p-4`}
            >
              <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${LEVEL_STYLES[item.level].dot}`} />
              {(() => {
                const owner = childFor(item);
                if (!owner) return null;
                return (
                  <span
                    title={owner.child.name}
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${owner.accent.solid}`}
                  >
                    {childInitial(owner.child.name)}
                  </span>
                );
              })()}
              <button
                onClick={() => clickable && onNavigate!(item.link!)}
                disabled={!clickable}
                className={`min-w-0 flex-1 text-left ${clickable ? 'cursor-pointer group' : 'cursor-default'}`}
              >
                <p className={`font-medium text-gray-800 ${clickable ? 'group-hover:text-emerald-700' : ''}`}>
                  {label(item)}
                </p>
                <p className="text-sm text-gray-500 mt-1">{body(item)}</p>
              </button>
              {clickable && (
                <button
                  onClick={() => onNavigate!(item.link!)}
                  aria-label={text.open}
                  className="self-center shrink-0 inline-flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition"
                >
                  <span className="hidden sm:inline">{text.open}</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
