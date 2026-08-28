import { useEffect, useRef, useState, type ReactNode } from 'react';
import { selectionChanged } from '../../../lib/haptics';

// Apple's standard interface easing — the same curve the tab bar uses, so a
// sheet settling and the selection pill sliding feel like one system.
const APPLE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /**
   * The heights the sheet is allowed to rest at, as a fraction of the screen,
   * smallest first. Closed (0) is always available and is not listed.
   *
   * A sheet with one detent can only be pulled shut; a sheet with two can also
   * be pulled the rest of the way open.
   */
  detents?: number[];
  /** Fraction of the sheet's width the grabber spans. */
  handleWidth?: string;
  label?: string;
  className?: string;
  children: ReactNode;
}

/**
 * A sheet you can actually grab.
 *
 * Every bottom sheet in the app already had a grabber drawn on it, but it was
 * a picture of one: the only way to close the sheet was to find the X, or to
 * hit the sliver of backdrop above it. The bar now does the job it looks like
 * it does — drag it down to dismiss, and (where the sheet has somewhere to go)
 * drag it up to fill the screen.
 *
 * The drag lives on the handle rather than the whole sheet on purpose: the
 * body of a sheet scrolls, and a surface that both scrolls and drags away
 * under your finger is a surface where neither gesture is reliable.
 */
export default function BottomSheet({
  open,
  onClose,
  detents = [0.75],
  handleWidth = '30%',
  label,
  className = '',
  children,
}: BottomSheetProps) {
  const stops = detents.slice().sort((a, b) => a - b);
  const max = stops[stops.length - 1];
  const [detent, setDetent] = useState(stops[0]);
  const [drag, setDrag] = useState(0);
  const dragging = useRef(false);
  const startY = useRef(0);
  const lastSnap = useRef(stops[0]);

  // Reopening always starts at the smallest resting height, never at whatever
  // the last session happened to leave it at.
  useEffect(() => {
    if (open) {
      setDetent(stops[0]);
      lastSnap.current = stops[0];
      setDrag(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const viewport = typeof window === 'undefined' ? 800 : window.innerHeight;

  // Closed counts as a stop: dragging past the smallest height dismisses.
  const nearest = (fraction: number) => {
    const candidates = [0, ...stops];
    return candidates.reduce((best, s) =>
      Math.abs(s - fraction) < Math.abs(best - fraction) ? s : best,
    );
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    dragging.current = true;
    startY.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    // Resist upward drags past the tallest detent so the sheet cannot be
    // flung off the top of the screen.
    const limited = detent >= max && dy < 0 ? dy / 4 : dy;
    setDrag(limited);

    // Tick as the finger crosses into the range of a different resting
    // height, so the detents can be felt rather than discovered on release.
    const snap = nearest(detent - limited / viewport);
    if (snap !== lastSnap.current) {
      lastSnap.current = snap;
      selectionChanged();
    }
  };

  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const settled = nearest(detent - drag / viewport);
    setDrag(0);
    if (settled === 0) {
      onClose();
      return;
    }
    setDetent(settled);
    lastSnap.current = settled;
  };

  // The sheet is always rendered at its tallest and pushed down to whichever
  // height it is resting at — animating a translate is smooth where animating
  // a height is not.
  const pushDown = ((max - detent) / max) * 100;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/40"
      style={{ animation: `mobilenav-fade 220ms ${APPLE_EASE}` }}
      onClick={onClose}
    >
      <div
        className={`mt-auto flex w-full flex-col overflow-hidden rounded-t-3xl bg-white ${className}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          height: `${max * 100}%`,
          transform: `translateY(calc(${pushDown}% + ${drag}px))`,
          transition: dragging.current ? 'none' : `transform 360ms ${APPLE_EASE}`,
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {/* The grabber. Its hit area is the full-width strip around it, not the
            few pixels it is drawn as — a 6px target is a decoration. */}
        <div
          role="separator"
          aria-label={label}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // Without this the browser claims the vertical gesture for scrolling
          // and the pointermove events stop arriving mid-drag.
          style={{ touchAction: 'none' }}
          className="flex shrink-0 cursor-grab justify-center py-3 active:cursor-grabbing"
        >
          <span
            className="h-1.5 rounded-full bg-black/15"
            style={{ width: handleWidth }}
          />
        </div>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
