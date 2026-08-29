import Spinner from './Spinner';

/**
 * The thing a panel shows while it is fetching: the branded waw spinner,
 * centred where the content will land, with an optional line of text under it.
 *
 * Replaces the bare "Laden..." / "Yükleniyor..." lines that used to sit alone
 * on an otherwise empty panel — a word with nothing moving reads as a glitch,
 * not as progress. Pair it with useMinimumLoading so the spinner is on screen
 * long enough to draw itself.
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
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 text-gray-400 ${
        compact ? 'py-8' : 'py-16'
      } ${className}`}
    >
      <Spinner size={size} />
      {label ? <p className="text-sm">{label}</p> : null}
    </div>
  );
}
