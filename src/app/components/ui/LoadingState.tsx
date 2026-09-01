import { useEffect, useState } from 'react';
import Spinner from './Spinner';
import { SPINNER_DELAY_MS } from '../../hooks/useMinimumLoading';

/**
 * The thing a panel shows while it is fetching: the branded waw spinner,
 * centred where the content will land, with an optional line of text under it.
 *
 * The waw holds itself back for a fifth of a second. A load that resolves
 * inside that window never draws a spinner — the panel keeps its space and
 * the content lands, so the fast case reads as instant rather than as a
 * loading screen that came and went. Past that, the load is slow enough that
 * the reader deserves to be told something is happening, and the branded
 * loader takes over (pair it with useMinimumLoading so it stays long enough
 * to draw itself).
 */
export default function LoadingState({
  label,
  size = 40,
  compact = false,
  className = '',
}: {
  label?: string;
  size?: number;
  /** less vertical room — for calendars, table cells, drilldown panels */
  compact?: boolean;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), SPINNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-gray-400 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      } ${compact ? 'py-8' : 'py-16'} ${className}`}
      aria-hidden={visible ? undefined : true}
    >
      <Spinner size={size} />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}
