import { useState, useEffect, useCallback, type ReactNode } from 'react';
import { Archive, CheckCircle2, ChevronRight, RefreshCw } from 'lucide-react';
import { childAccent, childInitial } from './childIdentity';
import LoadingState from './ui/LoadingState';
import { useMinimumLoading } from '../hooks/useMinimumLoading';

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
  /** Already read and filed — shown under "Archief" instead of at the top. */
  dismissed?: boolean;
}

interface ActionCenterProps {
  language: 'tr' | 'nl';
  apiRequest: (endpoint: string, options?: RequestInit) => Promise<any>;
  /**
   * '#billing' -> the billing tab, '#account' -> the account panel, …
   *
   * Return true to say the entry is finished by being opened — an
   * announcement, a reminder — and it moves to the archive. Everything else
   * returns nothing and stays until the task behind it is actually done.
   */
  onNavigate?: (link: string, item: ActionItem) => boolean | void;
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
  /**
   * Show only the entries about this child (plus the account-level ones, which
   * are about the reader rather than about a pupil).
   *
   * The list used to span every child on purpose. In a family with two
   * children that meant the home screen mixed both of them together while the
   * switcher above said one name — so the page contradicted its own heading.
   * Scoping it to the selected child makes every screen in the app answer for
   * exactly one child; the switcher is one tap away for the other.
   */
  filterChildId?: string;
  /** Also refresh whatever else the caller shows, when "Vernieuwen" is tapped. */
  onRefresh?: () => void;
  /** Rendered inside the section, after the feed entries. */
  footer?: ReactNode;
  /** Keep the section on screen even with no feed entries. */
  alwaysShow?: boolean;
  /**
   * Called after an entry has been opened and dealt with, so the caller can
   * file it away. Most entries need nothing here — they disappear when the
   * task behind them is done. It exists for the two that have no task: an
   * announcement and a reminder, which are finished the moment they are read.
   *
   * Optimistic on this side: the entry moves to the archive immediately and
   * the request is sent in the background.
   */
  onDismiss?: (key: string) => void;
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
  filterChildId,
  onRefresh,
  footer,
  alwaysShow = false,
  onDismiss,
}: ActionCenterProps) {
  const tr = language === 'tr';
  const text = tr
    ? {
        title: 'Sizden bekleyenler',
        allClear: 'Şu anda yapmanız gereken bir şey yok.',
        refresh: 'Yenile',
        open: 'Aç',
        // Named, not a bare "Arşiv": the parent's home screen carries three
        // of these buttons within a screen height of each other (this one,
        // the lesson reports, the behaviour remarks). Unlabelled they read as
        // one control repeated three times.
        archive: 'Arşiv · bekleyenler',
        hideArchive: 'Bekleyenler arşivini gizle',
      }
    : {
        title: 'Wat om uw aandacht vraagt',
        allClear: 'Er staat op dit moment niets open.',
        refresh: 'Vernieuwen',
        open: 'Openen',
        archive: 'Archief · meldingen',
        hideArchive: 'Archief meldingen verbergen',
      };

  const [rawItems, setRawItems] = useState<ActionItem[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  // Keys archived in this session. The server is the record; this is what
  // keeps the entry from jumping back to the top between the tap and the
  // next fetch.
  const [justArchived, setJustArchived] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const showLoading = useMinimumLoading(loading);
  // A parent has one job on this screen and it is not diagnosing our server.
  // A failed load renders as nothing at all rather than as an error card that
  // they can neither act on nor dismiss.
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/signals/today');
      setRawItems(res?.feed || []);
      setFailed(false);
    } catch {
      setFailed(true);
      setRawItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiRequest]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const refresh = () => {
    load();
    onRefresh?.();
  };

  // Every per-child entry the server builds carries the student id in its key
  // and its link (`parent_billing:<id>`, `#billing:<id>`). An entry that names
  // *another* child is dropped; one that names no child at all — "vul uw
  // telefoonnummer aan" — is about the account and always stays.
  const otherChildIds = filterChildId
    ? childrenList.map((c) => c.id).filter((id) => id !== filterChildId)
    : [];
  const visible = otherChildIds.length
    ? rawItems.filter((item) => {
        const haystack = `${item.key}:${item.link || ''}`;
        return !otherChildIds.some((id) => haystack.includes(id));
      })
    : rawItems;

  const isArchived = (item: ActionItem) => item.dismissed || justArchived.has(item.key);
  const items = visible.filter((item) => !isArchived(item));
  const archived = visible.filter(isArchived);

  const archive = (key: string) => {
    setJustArchived((prev) => new Set(prev).add(key));
    onDismiss?.(key);
  };

  // Nothing to say, or nothing to say *yet* — either way, take up no room.
  if ((loading || failed) && !alwaysShow) return null;
  if (items.length === 0 && archived.length === 0 && !alwaysShow && !showAllClear) return null;

  const label = (item: ActionItem) => (tr ? item.titleTr : item.titleNl);
  const body = (item: ActionItem) => (tr ? item.bodyTr : item.bodyNl);

  // Which child an entry is about. Every per-child key and link the server
  // builds carries the student id (`parent_billing:<id>`, `#billing:<id>`);
  // account-level entries such as the missing phone number carry neither, and
  // correctly get no badge.
  const showBadges = childrenList.length > 1 && !filterChildId;
  const childFor = (item: ActionItem) => {
    if (!showBadges) return null;
    const haystack = `${item.key}:${item.link || ''}`;
    const i = childrenList.findIndex((c) => haystack.includes(c.id));
    return i < 0 ? null : { child: childrenList[i], accent: childAccent(i) };
  };

  const row = (item: ActionItem, inArchive: boolean) => {
    const clickable = !!item.link && !!onNavigate;
    const open = () => {
      if (!clickable) return;
      if (onNavigate!(item.link!, item) === true) archive(item.key);
    };
    return (
      <div
        key={item.key}
        className={`bg-white border border-gray-200 rounded-xl ${
          inArchive ? 'border-l-4 border-l-gray-300 opacity-80' : LEVEL_STYLES[item.level].border
        } flex items-start gap-3 p-4`}
      >
        <span
          className={`mt-2 w-2 h-2 rounded-full shrink-0 ${
            inArchive ? 'bg-gray-300' : LEVEL_STYLES[item.level].dot
          }`}
        />
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
          onClick={open}
          disabled={!clickable}
          className={`min-w-0 flex-1 text-left ${clickable ? 'cursor-pointer group' : 'cursor-default'}`}
        >
          <p className={`font-medium ${inArchive ? 'text-gray-500' : 'text-gray-800'} ${clickable ? 'group-hover:text-emerald-700' : ''}`}>
            {label(item)}
          </p>
          <p className="text-sm text-gray-500 mt-1">{body(item)}</p>
        </button>
        {clickable && (
          <button
            onClick={open}
            aria-label={text.open}
            className={`self-center shrink-0 inline-flex items-center gap-1 text-sm font-medium px-3 py-2 rounded-lg transition ${
              inArchive
                ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700'
            }`}
          >
            <span className="hidden sm:inline">{text.open}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="mb-4 sm:mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-lg sm:text-xl font-semibold text-emerald-800">{text.title}</h2>
        <button
          onClick={refresh}
          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {text.refresh}
        </button>
      </div>

      {showLoading && <LoadingState compact size={32} />}

      {items.length === 0 && !showLoading && !failed && showAllClear && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          {text.allClear}
        </div>
      )}

      <div className="space-y-2">
        {items.map((item) => row(item, false))}

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
            {showArchive && <div className="mt-2 space-y-2">{archived.map((item) => row(item, true))}</div>}
          </div>
        )}
        {footer}
      </div>
    </div>
  );
}
