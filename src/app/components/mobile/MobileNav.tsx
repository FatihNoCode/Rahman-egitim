import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from '../EmojiIcons';
import type { Language } from '../../App';
import { type MobileNavItem, VISIBLE_SLOTS } from './navPrefs';
import { selectionStart, selectionChanged, selectionEnd } from '../../../lib/haptics';
import { logAction } from '../../../lib/deviceLog';

interface MobileNavProps {
  items: MobileNavItem[];
  active: string;
  onChange: (id: string) => void;
  language: Language;
  /**
   * Persist a new destination order. Given this, a tab can be picked up off
   * the bar itself — press and hold, then slide — instead of only in the
   * settings screen, which is where nobody looks for it.
   *
   * The first destination is pinned (see homeNavId in navPrefs) and neither
   * moves nor makes room.
   */
  onReorder?: (orderedIds: string[]) => void;
  // When false the bar sits in normal flow (a flex child) instead of floating
  // over the page. Used by full-height destinations like Elif-Ba where the
  // content must be bounded to the space above the bar, not run underneath it.
  floating?: boolean;
}

const MORE_LABEL = { nl: 'Meer', tr: 'Daha' };

// Apple's standard interface easing. Decelerates hard at the end, which is what
// makes the indicator feel like it settles into place rather than coasting.
const APPLE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

type Slot =
  | { kind: 'tab'; item: MobileNavItem }
  | { kind: 'more' };

// Floating "island" tab bar for the app layout. Two things make it feel native
// rather than like a web page's bottom nav:
//
//  1. It's a detached, translucent capsule — the page scrolls visibly behind
//     it, the way iOS 26's own bars do, instead of an opaque strip welded to
//     the bottom edge.
//  2. You can drag along it. Press anywhere on the bar and slide, and the
//     selection follows your finger with a tick of haptic feedback at each
//     destination, exactly like dragging across a UISegmentedControl. Tapping
//     still works unchanged.
export default function MobileNav({ items, active, onChange, language, floating = true, onReorder }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  // How far the More sheet has been dragged down, and whether that drag is
  // live. The sheet has exactly one resting height, so the bar on it is a
  // dismiss control and nothing else — dragging up does not open it further.
  const [sheetDrag, setSheetDrag] = useState(0);
  const sheetDragging = useRef(false);
  const sheetStartY = useRef(0);
  // Which tab is being carried, once a press has been held long enough to
  // mean "pick this up" rather than "open this".
  const [reorderIndex, setReorderIndex] = useState<number | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pressed, setPressed] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  // Which slot the finger went down on, and whether it ever left it. Needed
  // because on Android the gesture frequently ends in `pointercancel` rather
  // than `pointerup` — see onPointerCancel.
  const downSlot = useRef(-1);
  const moved = useRef(false);
  // When the More sheet was opened. The backdrop closes on click, and the
  // compatibility click that follows the very tap that opened it lands on that
  // backdrop — it is created underneath the finger before the click is
  // dispatched. That ghost click closed the sheet in the same frame it opened,
  // which is why More looked completely dead to a tap while a drag-and-release
  // onto it worked (a drag suppresses the click entirely).
  const openedAt = useRef(0);

  const cancelHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  useEffect(() => cancelHold, []);

  const openMore = () => {
    openedAt.current = Date.now();
    setMoreOpen(true);
  };

  const closeMore = () => {
    // Ignore anything arriving in the same gesture that opened the sheet.
    if (Date.now() - openedAt.current < 400) return;
    setMoreOpen(false);
  };

  // With just one extra destination there's no point hiding it behind More —
  // show everything. Otherwise keep VISIBLE_SLOTS on the bar + a More button.
  const needsMore = items.length > VISIBLE_SLOTS + 1;
  const primary = needsMore ? items.slice(0, VISIBLE_SLOTS) : items;
  const overflow = needsMore ? items.slice(VISIBLE_SLOTS) : [];
  const overflowActive = overflow.some((i) => i.id === active);

  const slots: Slot[] = [
    ...primary.map((item) => ({ kind: 'tab' as const, item })),
    ...(needsMore ? [{ kind: 'more' as const }] : []),
  ];

  // Where the sliding pill sits. When the active destination lives in the
  // overflow sheet the pill parks on the More button, so the bar still shows
  // where you are rather than looking like nothing is selected.
  const activeIndex = overflowActive
    ? slots.length - 1
    : Math.max(0, primary.findIndex((i) => i.id === active));

  const pick = (id: string) => {
    // Every destination the user opens goes into the on-device log, so a bug
    // report carries the route that led to it rather than just the error.
    logAction('Navigatie', items.find((i) => i.id === id)?.label ?? id);
    onChange(id);
    setMoreOpen(false);
  };

  const slotAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return -1;
    const r = el.getBoundingClientRect();
    const i = Math.floor(((clientX - r.left) / r.width) * slots.length);
    return Math.max(0, Math.min(slots.length - 1, i));
  };

  // Selecting a tab mid-drag is safe, but *opening the More sheet* mid-drag is
  // not — a sheet appearing under a moving finger is disorienting, and it would
  // fire the moment you swiped past the last tab. So dragging only ever changes
  // tabs; More is left to activate on release.
  const selectAt = (index: number) => {
    const slot = slots[index];
    if (!slot || slot.kind !== 'tab' || slot.item.id === active) return;
    logAction('Navigatie', slot.item.label);
    onChange(slot.item.id);
    selectionChanged();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Mouse right/middle clicks shouldn't start a drag.
    if (e.button !== 0) return;
    // Pointer capture is deliberately *not* taken here — only once the finger
    // actually moves (see onPointerMove). Capturing immediately would retarget
    // the tap's compatibility click event from the button to this track div,
    // which is what left the More button unclickable as a plain tap: dragging
    // needs capture to keep tracking the finger past the element's edge, but a
    // plain tap never leaves the element, so it doesn't need it — and skipping
    // it lets the button's own onClick fire normally for a tap.
    dragging.current = true;
    const i = slotAt(e.clientX);
    downSlot.current = i;
    moved.current = false;
    setPressed(i);
    selectionStart();
    selectAt(i);

    // Held still on a movable tab: pick it up. 450ms is long enough that a
    // normal tap never trips it and short enough that someone deliberately
    // holding a tab does not conclude nothing is going to happen. Slot 0 is
    // the pinned home tab, and the More button is not a destination, so
    // neither can be carried.
    cancelHold();
    if (onReorder && i > 0 && slots[i]?.kind === 'tab') {
      holdTimer.current = setTimeout(() => {
        if (!dragging.current || moved.current) return;
        e.currentTarget?.setPointerCapture?.(e.pointerId);
        setReorderIndex(i);
        selectionStart();
      }, 450);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const i = slotAt(e.clientX);

    // Carrying a tab: the finger moves the destination itself, not the
    // selection. The list is rewritten a slot at a time as it crosses each
    // boundary, so the bar under the finger always shows the order that will
    // be saved.
    if (reorderIndex !== null) {
      moved.current = true;
      const target = Math.max(1, Math.min(items.length - 1, i));
      if (target !== reorderIndex && slots[target]?.kind === 'tab') {
        const ids = items.map((it) => it.id);
        const [carried] = ids.splice(reorderIndex, 1);
        ids.splice(target, 0, carried);
        onReorder?.(ids);
        setReorderIndex(target);
        selectionChanged();
      }
      setPressed(target);
      return;
    }

    if (i !== downSlot.current) {
      moved.current = true;
      cancelHold();
      // First movement past the starting slot: this is now a drag, so start
      // capturing to keep receiving events even if the finger leaves the bar.
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setPressed(i);
    selectAt(i);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    cancelHold();
    const i = slotAt(e.clientX);
    setPressed(null);
    selectionEnd();
    if (reorderIndex !== null) {
      setReorderIndex(null);
      return;
    }
    // Only a *drag* that ended on More opens it from here. A plain tap is left
    // to the button's own onClick, which fires after this handler returns — by
    // then there is no backdrop under the finger to swallow it.
    if (moved.current && slots[i]?.kind === 'more') openMore();
  };

  // Android's WebView routinely ends a plain tap on the bar with `pointercancel`
  // instead of `pointerup` — the gesture gets claimed the moment the touch is
  // recognised. That cost More its only working trigger: tapping a *tab* still
  // worked, because tabs are selected on pointerdown, but More is deliberately
  // left to activate on release (a sheet must not appear under a moving finger),
  // and the button's own onClick never fires either, because setPointerCapture
  // retargets the subsequent click to the captured track rather than the button.
  // So More was dead to a tap and only reachable by dragging onto it — which is
  // exactly the bug reported on Android.
  //
  // A cancel that never left the slot it started in was a tap, so finish it the
  // way pointerup would have. A cancel mid-drag still does nothing.
  const onPointerCancel = () => {
    if (!dragging.current) return;
    dragging.current = false;
    cancelHold();
    setPressed(null);
    selectionEnd();
    if (reorderIndex !== null) {
      setReorderIndex(null);
      return;
    }
    if (!moved.current && slots[downSlot.current]?.kind === 'more') openMore();
  };

  // The More sheet's grabber. One resting height, so the only thing it does is
  // let go of the sheet — dragging up is resisted rather than opening it
  // further, because there is nothing further to open onto.
  const onSheetDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    sheetDragging.current = true;
    sheetStartY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onSheetMove = (e: React.PointerEvent) => {
    if (!sheetDragging.current) return;
    const dy = e.clientY - sheetStartY.current;
    setSheetDrag(dy > 0 ? dy : dy / 5);
  };

  const onSheetUp = () => {
    if (!sheetDragging.current) return;
    sheetDragging.current = false;
    const travelled = sheetDrag;
    setSheetDrag(0);
    // Past a thumb's worth of travel it was a dismissal, not a fidget.
    if (travelled > 60) {
      openedAt.current = 0;
      setMoreOpen(false);
    }
  };

  return (
    <>
      <nav
        className={`z-40 ${floating ? 'pointer-events-none fixed inset-x-0 bottom-0' : 'shrink-0'}`}
        style={{ paddingBottom: `calc(var(--safe-bottom) + 0.5rem)` }}
      >
        <div className="pointer-events-auto mx-auto max-w-md px-3">
          <div
            ref={trackRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            // touch-action:none is what lets a horizontal drag work at all —
            // without it the browser claims the gesture for scrolling and the
            // pointermove events stop arriving mid-swipe.
            style={{ touchAction: 'none' }}
            // No `ring-*` here: Tailwind compiles rings to box-shadow, which
            // would clobber the layered specular/lensing shadows that make up
            // the glass material. The hairline edge is part of .ios-glass.
            className="ios-glass relative flex rounded-[26px] p-1.5"
          >
            {/* Sliding selection pill, sized to one slot and moved by whole
                multiples of its own width. */}
            <span
              aria-hidden
              className="absolute inset-y-1.5 left-1.5 rounded-[20px] bg-emerald-600/15 motion-reduce:transition-none"
              style={{
                width: `calc((100% - 0.75rem) / ${slots.length})`,
                transform: `translateX(${activeIndex * 100}%)`,
                transition: `transform 420ms ${APPLE_EASE}`,
              }}
            />

            {slots.map((slot, index) => {
              const isActive = index === activeIndex;
              const isPressed = pressed === index;
              const label =
                slot.kind === 'more' ? MORE_LABEL[language] : slot.item.shortLabel ?? slot.item.label;
              const Icon = slot.kind === 'more' ? MoreHorizontal : slot.item.icon;
              return (
                <button
                  key={slot.kind === 'more' ? '__more' : slot.item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  aria-haspopup={slot.kind === 'more' ? 'dialog' : undefined}
                  aria-expanded={slot.kind === 'more' ? moreOpen : undefined}
                  aria-label={slot.kind === 'more' ? MORE_LABEL[language] : undefined}
                  // Pointer events drive the touch interaction, but they never
                  // fire for Enter/Space on a focused button — so keyboard
                  // users need this too. Re-selecting the current tab is a
                  // no-op, so the duplicate click after a tap is harmless.
                  onClick={() => (slot.kind === 'more' ? openMore() : pick(slot.item.id))}
                  // More is the one slot that activates on release rather than
                  // on press, which left it depending on the track's capture
                  // and `moved` bookkeeping to decide whether a gesture was a
                  // tap — and on Android that bookkeeping is what a stray
                  // `pointercancel` breaks. Opening from the button's own
                  // pointerup gives it a trigger that owes nothing to the
                  // track: the event reaches here first, and it only ever
                  // fires when the finger both went down and came up on this
                  // button. The track's pointerup/pointercancel and the
                  // click below remain as they were; openMore is idempotent,
                  // and closeMore already ignores anything arriving within
                  // 400ms of an open, so a duplicate cannot close the sheet
                  // it just opened.
                  onPointerUp={
                    slot.kind === 'more'
                      ? () => {
                          if (!moved.current && reorderIndex === null) openMore();
                        }
                      : undefined
                  }
                  // min-w-0 is load-bearing twice over: without it a flex item
                  // refuses to shrink below its content, so long labels like
                  // "Oudergesprekken" widen their slot (pushing neighbours out
                  // and defeating `truncate`) *and* break the drag hit-test
                  // below, which assumes every slot is exactly 1/n of the track.
                  className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] py-2"
                  style={{
                    transform:
                      reorderIndex === index
                        ? 'scale(1.12) translateY(-3px)'
                        : isPressed
                          ? 'scale(0.92)'
                          : 'scale(1)',
                    transition: `transform 220ms ${APPLE_EASE}`,
                    zIndex: reorderIndex === index ? 20 : undefined,
                  }}
                >
                  <Icon
                    className={`h-[22px] w-[22px] transition-colors duration-200 ${
                      isActive ? 'text-emerald-700' : 'text-gray-500'
                    }`}
                    strokeWidth={isActive ? 2.4 : 1.9}
                  />
                  <span
                    /* leading-none gave the line a box exactly one font-size
                       tall, and `truncate` clips whatever leaves it. At 10px
                       that box ends at the cap height, so in Turkish the tab
                       bar read "Odemeler" and "Odev" — the diaereses on Ö were
                       being sliced off the top while the same words rendered
                       correctly everywhere else. A normal line-height gives
                       the accents somewhere to be. */
                    className={`w-full truncate px-0.5 text-center text-[10px] font-semibold leading-[1.3] tracking-tight transition-colors duration-200 ${
                      isActive ? 'text-emerald-700' : 'text-gray-500'
                    }`}
                  >
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {moreOpen && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-black/30 backdrop-blur-[2px]"
          style={{ animation: `mobilenav-fade 220ms ${APPLE_EASE}` }}
          onClick={closeMore}
        >
          <div
            className="ios-glass-sheet mt-auto w-full overflow-hidden rounded-t-[2.25rem]"
            onClick={(e) => e.stopPropagation()}
            style={{
              paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)',
              transform: `translateY(${sheetDrag}px)`,
              transition: sheetDragging.current ? 'none' : `transform 320ms ${APPLE_EASE}`,
              animation: sheetDrag === 0 ? `mobilenav-sheet 380ms ${APPLE_EASE}` : undefined,
            }}
          >
            {/* Grabber. Wide enough to be aimed at without looking, and it
                actually drags: pull it down and the sheet goes away. Up does
                nothing — there is no taller position for this sheet to go to,
                so pretending otherwise would just be a gesture that fails. */}
            <div
              role="separator"
              aria-label={MORE_LABEL[language]}
              onPointerDown={onSheetDown}
              onPointerMove={onSheetMove}
              onPointerUp={onSheetUp}
              onPointerCancel={onSheetUp}
              style={{ touchAction: 'none' }}
              className="flex cursor-grab justify-center pb-1.5 pt-3 active:cursor-grabbing"
            >
              <span className="h-1.5 w-[30%] rounded-full bg-black/15" />
            </div>
            <h3 className="px-5 pb-1 pt-1 text-[13px] font-semibold uppercase tracking-wide text-gray-400">
              {MORE_LABEL[language]}
            </h3>
            <div className="grid grid-cols-3 gap-1 p-3 pt-1">
              {overflow.map(({ id, label, icon: Icon }) => {
                const isActive = id === active;
                return (
                  <button
                    key={id}
                    onClick={() => {
                      selectionChanged();
                      pick(id);
                    }}
                    className={`flex flex-col items-center gap-2 rounded-2xl px-2 py-4 text-center transition active:scale-95 ${
                      isActive ? 'bg-emerald-50' : 'active:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-full ${
                        isActive ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30' : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className={`text-xs font-medium ${isActive ? 'text-emerald-700' : 'text-gray-600'}`}>
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
