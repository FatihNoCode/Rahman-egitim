import { useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { Language } from '../../App';
import { type MobileNavItem, VISIBLE_SLOTS } from './navPrefs';
import { selectionStart, selectionChanged, selectionEnd } from '../../../lib/haptics';

interface MobileNavProps {
  items: MobileNavItem[];
  active: string;
  onChange: (id: string) => void;
  language: Language;
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
export default function MobileNav({ items, active, onChange, language, floating = true }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [pressed, setPressed] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

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
    onChange(slot.item.id);
    selectionChanged();
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Mouse right/middle clicks shouldn't start a drag.
    if (e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    const i = slotAt(e.clientX);
    setPressed(i);
    selectionStart();
    selectAt(i);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const i = slotAt(e.clientX);
    setPressed(i);
    selectAt(i);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    const i = slotAt(e.clientX);
    setPressed(null);
    selectionEnd();
    if (slots[i]?.kind === 'more') setMoreOpen(true);
  };

  const onPointerCancel = () => {
    dragging.current = false;
    setPressed(null);
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
                  // Pointer events drive the touch interaction, but they never
                  // fire for Enter/Space on a focused button — so keyboard
                  // users need this too. Re-selecting the current tab is a
                  // no-op, so the duplicate click after a tap is harmless.
                  onClick={() => (slot.kind === 'more' ? setMoreOpen(true) : pick(slot.item.id))}
                  // min-w-0 is load-bearing twice over: without it a flex item
                  // refuses to shrink below its content, so long labels like
                  // "Oudergesprekken" widen their slot (pushing neighbours out
                  // and defeating `truncate`) *and* break the drag hit-test
                  // below, which assumes every slot is exactly 1/n of the track.
                  className="relative z-10 flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[20px] py-2"
                  style={{
                    transform: isPressed ? 'scale(0.92)' : 'scale(1)',
                    transition: `transform 220ms ${APPLE_EASE}`,
                  }}
                >
                  <Icon
                    className={`h-[22px] w-[22px] transition-colors duration-200 ${
                      isActive ? 'text-emerald-700' : 'text-gray-500'
                    }`}
                    strokeWidth={isActive ? 2.4 : 1.9}
                  />
                  <span
                    className={`w-full truncate px-0.5 text-center text-[10px] font-semibold leading-none tracking-tight transition-colors duration-200 ${
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
          onClick={() => setMoreOpen(false)}
        >
          <div
            className="ios-glass-sheet mt-auto w-full overflow-hidden rounded-t-[2.25rem]"
            onClick={(e) => e.stopPropagation()}
            style={{
              paddingBottom: 'calc(var(--safe-bottom) + 0.5rem)',
              animation: `mobilenav-sheet 380ms ${APPLE_EASE}`,
            }}
          >
            {/* Grabber. iOS puts one on every sheet — it reads as "this is a
                surface you can dismiss" without needing a close button. */}
            <div className="flex justify-center pb-1 pt-2.5">
              <span className="h-1.5 w-9 rounded-full bg-black/15" />
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
