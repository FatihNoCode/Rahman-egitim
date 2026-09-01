import { AlertTriangle, RefreshCw } from '../EmojiIcons';

/**
 * What a list shows when it could not be fetched.
 *
 * Before this, a failed load was caught, logged to the console and otherwise
 * swallowed — so the view rendered its empty state instead. "Er zijn nog geen
 * inschrijvingen" and "we konden de inschrijvingen niet ophalen" look
 * identical on screen and mean opposite things: one is nothing to do, the
 * other is work sitting unseen behind a network error. An admin has no way to
 * tell them apart, and no reason to try again.
 *
 * Deliberately not a toast. A toast is gone in four seconds and says nothing
 * about *which* part of the screen is missing; this stays where the data
 * should have been, for as long as it is still missing, with the retry right
 * there.
 */
export default function LoadError({
  language,
  onRetry,
  className = '',
}: {
  language: 'nl' | 'tr';
  onRetry: () => void;
  className?: string;
}) {
  const tr = language === 'tr';

  return (
    <div
      role="alert"
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center ${className}`}
    >
      <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-amber-500" />
      <p className="text-sm font-semibold text-amber-900">
        {tr ? 'Bilgiler yüklenemedi' : 'De gegevens konden niet worden geladen'}
      </p>
      <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-amber-800">
        {tr
          ? 'Bağlantı sorunu olabilir. Lütfen tekrar deneyin; sorun devam ederse daha sonra bir kez daha bakın.'
          : 'Waarschijnlijk een verbindingsprobleem. Probeer het opnieuw; blijft het misgaan, kijk dan later nog een keer.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        {tr ? 'Tekrar dene' : 'Opnieuw proberen'}
      </button>
    </div>
  );
}
